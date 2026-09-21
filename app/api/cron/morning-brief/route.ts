// Scheduled morning brief - VCoS-AI runs /gm and posts it to Slack so the team
// gets it before anyone opens the app. Triggered by the Netlify scheduled
// function (x-cron-secret) and can also be run manually by an admin to test.
import { NextRequest, NextResponse } from "next/server";
import { getCached } from "@/lib/api-cache";
import { runMorningBrief, MORNING_BRIEF_SOURCE } from "@/lib/morning-brief";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SOURCE = MORNING_BRIEF_SOURCE;

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

  const result = await runMorningBrief();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, posted: result.posted, brief: result.text });
}
