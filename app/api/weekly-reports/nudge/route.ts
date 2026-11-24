// GET  /api/weekly-reports/nudge?week_start=YYYY-MM-DD
//      Nudges sent for that report week: [{ member_name, sent_at, sent_by }].
// POST /api/weekly-reports/nudge  { names: string[], week_start }
//      DMs each person from the VCOS Bot asking them to submit their weekly
//      report for that week, with a link to the form.
//
// Admin/owner only. Every attempt is logged in weekly_report_nudges
// (scripts/weekly-report-nudges.sql). At most one nudge per person per day
// (Pacific Time), and never to someone whose report for the week is already
// in (filed in VCoS or marked done). Without the log table nothing is sent,
// so nudges can never go out unlogged or unlimited.
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getTeamMembers } from "@/lib/team-db";
import { isManager } from "@/lib/roles";
import { usersList, postMessage } from "@/lib/slack";
import { reportersForWeek, namesWhoFiled } from "@/lib/weekly-reports-db";
import { slackUserIndex, resolveSlackUserId, type SlackUser } from "@/lib/admin-notify";
import {
  fmtWeekRange,
  getMondayOfWeekPT,
  parseWeekStart,
  todayPT,
  weekLabelVariants,
} from "@/lib/week-utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TABLE = "weekly_report_nudges";
const NO_TABLE =
  "Nudges aren't set up yet: run scripts/weekly-report-nudges.sql in Supabase first.";

function forbidden() {
  return NextResponse.json({ error: "Admin access required" }, { status: 403 });
}

function weekFrom(weekStart: string | null | undefined): Date | null {
  if (!weekStart || !ISO_DATE.test(weekStart)) return null;
  const monday = getMondayOfWeekPT(parseWeekStart(weekStart));
  return monday.getTime() > getMondayOfWeekPT().getTime() ? null : monday;
}

export async function GET(req: NextRequest) {
  if (!isManager(req.headers.get("x-role"))) return forbidden();
  const monday = weekFrom(new URL(req.url).searchParams.get("week_start"));
  if (!monday)
    return NextResponse.json({ error: "week_start (YYYY-MM-DD) required" }, { status: 400 });

  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("member_name, sent_at, sent_by")
    .in("week_label", weekLabelVariants(monday))
    .eq("ok", true)
    .order("sent_at", { ascending: false });
  // Table not created yet: no nudges to show, and the UI says why on send.
  if (error) return NextResponse.json({ nudges: [], setupNeeded: true });
  return NextResponse.json({ nudges: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!isManager(req.headers.get("x-role"))) return forbidden();
  if (!process.env.SLACK_BOT_TOKEN)
    return NextResponse.json({ error: "SLACK_BOT_TOKEN not configured" }, { status: 500 });

  let body: { names?: unknown; week_start?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const monday = weekFrom(body.week_start);
  const names = Array.isArray(body.names)
    ? body.names.filter((n): n is string => typeof n === "string")
    : [];
  if (!monday || !names.length)
    return NextResponse.json(
      { error: "names and week_start (YYYY-MM-DD) are required" },
      { status: 400 },
    );

  const sb = getSupabase();
  const weekLabel = fmtWeekRange(monday);
  const today = todayPT();

  // Who was already nudged today. Doubles as the "is the log table there?" check.
  const { data: sentToday, error: logErr } = await sb
    .from(TABLE)
    .select("member_name")
    .in("member_name", names)
    .eq("nudge_date", today)
    .eq("ok", true);
  if (logErr) return NextResponse.json({ error: NO_TABLE }, { status: 503 });

  const [members, reporters, slackUsers] = await Promise.all([
    getTeamMembers(),
    reportersForWeek(monday),
    usersList()
      .then((r: { members?: SlackUser[] }) => r.members ?? [])
      .catch(() => [] as SlackUser[]),
  ]);
  const owesReport = new Set(members.filter((m) => m.files_report).map((m) => m.full_name));
  const filed = new Set(namesWhoFiled(names, reporters));
  const nudgedToday = new Set((sentToday ?? []).map((r) => r.member_name as string));
  const index = slackUserIndex(slackUsers);
  const sender = req.headers.get("x-user") ?? "admin";
  const base = (process.env.NEXT_PUBLIC_URL ?? process.env.URL ?? "").replace(/\/$/, "");

  const sent: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const failed: { name: string; reason: string }[] = [];

  for (const name of Array.from(new Set(names))) {
    if (!owesReport.has(name)) {
      skipped.push({ name, reason: "doesn't owe a weekly report" });
      continue;
    }
    if (filed.has(name)) {
      skipped.push({ name, reason: "report already in" });
      continue;
    }
    if (nudgedToday.has(name)) {
      skipped.push({ name, reason: "already nudged today" });
      continue;
    }
    const member = members.find((m) => m.full_name === name);
    const uid = resolveSlackUserId(member, name, index);
    let error: string | null = null;
    if (!uid) error = "no Slack account found";
    else {
      const first = name.split(" ")[0];
      const text = `👋 Hi ${first}, a reminder that your weekly report for ${weekLabel} isn't in yet. Please submit it here: ${base}/submit`;
      try {
        await postMessage(uid, text);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    await sb.from(TABLE).insert({
      member_name: name,
      week_label: weekLabel,
      nudge_date: today,
      sent_by: sender,
      ok: !error,
      error,
    });
    if (error) failed.push({ name, reason: error });
    else sent.push(name);
  }

  return NextResponse.json({ ok: true, sent, skipped, failed });
}
