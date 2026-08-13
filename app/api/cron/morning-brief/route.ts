// Scheduled morning brief - VCoS-AI runs /gm and posts it to Slack so the team
// gets it before anyone opens the app. Triggered by the Netlify scheduled
// function (x-cron-secret) and can also be run manually by an admin to test.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_STATIC, buildLiveBlock } from "@/lib/vcos-brain";
import { buildChatContext } from "@/lib/chat-context";
import { recordSuccess, getCached } from "@/lib/api-cache";
import { stripLogBlocks } from "@/lib/memory";
import { postMessage } from "@/lib/slack";
import { SLACK_ADMIN_CHANNEL } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SOURCE = "morning-brief";

const PROMPT = `Run /gm - the daily team morning brief for RampRate leadership.
Cover, in tight markdown (short **bold** section headers + bullet lists, NO tables):
- The one thing that matters most today
- 🔴 Overdue - who has overdue tasks/commitments (names + counts) and the most urgent items
- 📋 Weekly reports - who is missing this week
- 💼 Deals - any flags on active deals
- ✅ Suggested focus - one concrete recommendation
Be specific with real names and numbers from the data. Keep it under ~250 words.`;

// Convert the model's markdown into Slack mrkdwn so it renders in Slack.
function toSlackMrkdwn(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "<$2|$1>")
    .replace(/^\s*#{1,6}\s+(.*)$/gm, "*$1*")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/__([^_]+)__/g, "*$1*")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function generateBrief(): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY_REPORTS;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY_REPORTS not configured");
  const ctx = await buildChatContext("tony", true); // whole-team, admin scope
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: [
      {
        type: "text" as const,
        text: SYSTEM_STATIC,
        cache_control: { type: "ephemeral" as const },
      },
      { type: "text" as const, text: buildLiveBlock(ctx) },
    ],
    messages: [{ role: "user", content: PROMPT }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  return stripLogBlocks(text).trim();
}

// GET - return the last generated brief (any authenticated user).
export async function GET(req: NextRequest) {
  if (!req.headers.get("x-role"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getCached(SOURCE).catch(() => null);
  return NextResponse.json({ brief: row?.data ?? null });
}

// POST - generate + post to Slack. Cron-secured, or an admin running it manually.
export async function POST(req: NextRequest) {
  const isCron = req.headers.get("x-cron-secret") === process.env.CRON_SECRET;
  const isAdmin = ["admin", "owner"].includes(req.headers.get("x-role") ?? "");
  if (!isCron && !isAdmin)
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );

  try {
    const text = await generateBrief();
    await recordSuccess(SOURCE, {
      text,
      generatedAt: new Date().toISOString(),
    });

    let posted = false;
    if (process.env.SLACK_BOT_TOKEN && text) {
      const channel = process.env.SLACK_BRIEF_CHANNEL ?? SLACK_ADMIN_CHANNEL;
      const today = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      await postMessage(
        channel,
        `:sunrise: *VCoS-AI - Morning Brief · ${today}*\n\n${toSlackMrkdwn(text)}`,
      );
      posted = true;
    }
    return NextResponse.json({ ok: true, posted, brief: text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Brief generation failed" },
      { status: 502 },
    );
  }
}
