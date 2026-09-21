// Shared VCoS-AI morning brief logic - generates the /gm brief and posts it
// to Slack. Used by both the cron-triggered route (app/api/cron/morning-brief)
// and the admin "refresh" action on the Systems page (app/api/cache-health),
// so a manual test run exercises the exact same path as the scheduled job.
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_STATIC, buildLiveBlock } from "@/lib/vcos-brain";
import { buildChatContext } from "@/lib/chat-context";
import { recordSuccess, recordFailure } from "@/lib/api-cache";
import { stripLogBlocks } from "@/lib/memory";
import { postMessage } from "@/lib/slack";
import { SLACK_ADMIN_CHANNEL } from "@/lib/constants";

export const MORNING_BRIEF_SOURCE = "morning-brief";

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
  // Explicit baseURL - see app/api/chat/route.ts for why (Netlify AI Gateway
  // silently injects ANTHROPIC_BASE_URL, which the SDK would otherwise use).
  const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com" });
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

export async function runMorningBrief(): Promise<{
  ok: boolean;
  posted: boolean;
  text?: string;
  error?: string;
}> {
  try {
    const text = await generateBrief();
    await recordSuccess(MORNING_BRIEF_SOURCE, {
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
    return { ok: true, posted, text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Brief generation failed";
    await recordFailure(MORNING_BRIEF_SOURCE, msg);
    return { ok: false, posted: false, error: msg };
  }
}
