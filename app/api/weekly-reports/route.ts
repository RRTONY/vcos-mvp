import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { postMessage } from "@/lib/slack";
import { getSupabase } from "@/lib/supabase";
import { getTeamMemberByUsername, getTeamMembers } from "@/lib/team-db";
import {
  parseWeekStart,
  fmtWeekRange,
  weekLabelVariants,
  getMondayOfWeekPT,
} from "@/lib/week-utils";
import { getCachedSWR } from "@/lib/api-cache";
import {
  openTasksFor,
  dueDateTasksOnly,
  TASK_STATUS_LABELS,
  type TaskReviewStatus,
} from "@/lib/open-tasks";
import { bucketFor } from "@/lib/due-buckets";
import { closeTask } from "@/lib/clickup";
import type { ClickUpData } from "@/lib/types";

import {
  SLACK_CHANNEL_WEEKLY_REPORTS,
  CACHE_TTL_SYSTEMS_MS,
} from "@/lib/constants";
const SLACK_CHANNEL =
  process.env.SLACK_CHANNEL_WEEKLY_REPORTS ?? SLACK_CHANNEL_WEEKLY_REPORTS;

// Builds one line per open task for a single reporter - never includes
// another team member's tasks, so this is always computed from that
// reporter's own ClickUp key, not from the full team snapshot. Task identity,
// name, and due date always come from ClickUp (not the client); the status
// and blocker note per task are the reporter's own submitted answers.
// Returned as individual lines (not one joined string) so the caller can pack
// them into Slack messages that stay under Slack's length limit without ever
// splitting a task away from its own note.
async function buildOpenTasksLines(
  name: string,
  taskStatusesRaw?: string,
): Promise<string[]> {
  const [clickupResult, teamMembers] = await Promise.all([
    getCachedSWR<ClickUpData>("clickup", CACHE_TTL_SYSTEMS_MS),
    getTeamMembers(),
  ]);
  const member = teamMembers.find((m) => m.full_name === name);
  const fallbackFirstName = name.split(" ")[0];
  const allTasks = openTasksFor(
    clickupResult.data?.tasksByAssignee,
    member?.clickup_key,
    fallbackFirstName,
  );
  const tasks = dueDateTasksOnly(allTasks);
  if (tasks.length === 0)
    return [
      `_No tasks with a due date right now - nice and clear._\nOwner: ${name}`,
    ];

  const statusMap = new Map<
    string,
    { status: TaskReviewStatus; note: string }
  >();
  if (taskStatusesRaw) {
    try {
      const parsed = JSON.parse(taskStatusesRaw) as Array<{
        id: string;
        status: TaskReviewStatus;
        note?: string;
      }>;
      for (const p of parsed)
        if (p?.id && p.status in TASK_STATUS_LABELS)
          statusMap.set(p.id, {
            status: p.status,
            note: (p.note ?? "").trim(),
          });
    } catch {
      /* malformed - fall back to "Not reviewed" for every task */
    }
  }

  // Push every task reviewed as "Done" back to ClickUp so the report is the
  // source of truth for status, not just a Slack-side label. Best-effort per
  // task - a ClickUp failure must never block the report from posting.
  const doneTasks = tasks.filter((t) => statusMap.get(t.id)?.status === "done");
  await Promise.all(
    doneTasks.map((t) =>
      closeTask(t.id, t.listId).catch((err) =>
        console.error(`ClickUp close failed for task ${t.id}:`, err),
      ),
    ),
  );

  const now = new Date();
  return tasks.map((t) => {
    const entry = statusMap.get(t.id);
    const label = entry ? TASK_STATUS_LABELS[entry.status] : "Not reviewed";
    const overdueFlag =
      bucketFor(t.dueTs, now) === "overdue" ? " *(OVERDUE)*" : "";
    let line = `• <${t.url}|${t.name}> - Owner: ${name} - due ${t.dueDate}${overdueFlag} - *${label}*`;
    if (
      entry &&
      (entry.status === "at_risk" || entry.status === "blocked") &&
      entry.note
    ) {
      line += `\n   ${entry.note}`;
    }
    return line;
  });
}

// Slack's chat.postMessage silently mangles very long text (truncates or, at
// certain lengths, drops content) rather than erroring - confirmed by testing
// directly against the API. With the open-tasks list now uncapped, a single
// weekly report can easily exceed that, so long reports are split into
// multiple sequential messages instead, each kept under a safe length and
// clearly labeled as a continuation.
const SLACK_CHUNK_LIMIT = 3000;

// A single atom (e.g. one Q&A answer) can itself exceed the chunk limit if
// someone pastes in a lot of text - fall back to splitting it by line so no
// individual piece we hand to Slack is ever oversized on its own.
function splitOversizedAtom(atom: string, limit: number): string[] {
  return atom.length <= limit ? [atom] : atom.split("\n");
}

function chunkIntoMessages(atomsIn: string[], limit: number): string[] {
  const atoms = atomsIn.flatMap((a) => splitOversizedAtom(a, limit));
  const chunks: string[] = [];
  let current: string[] = [];
  for (const atom of atoms) {
    const candidate = [...current, atom].join("\n\n");
    if (current.length > 0 && candidate.length > limit) {
      chunks.push(current.join("\n\n"));
      current = [atom];
    } else {
      current.push(atom);
    }
  }
  if (current.length > 0) chunks.push(current.join("\n\n"));
  return chunks;
}

// Posts the report as one or more sequential Slack messages and returns the
// first message's ts (used to locate/edit the report later). Best-effort per
// chunk - a failure on one chunk doesn't stop the rest from posting.
async function postWeeklyReportMessage(
  channel: string,
  name: string,
  week: string,
  atoms: string[],
): Promise<string | null> {
  const chunks = chunkIntoMessages(atoms, SLACK_CHUNK_LIMIT);
  const continuationHeader = `*Weekly Report - ${name} - ${week} (continued)*`;
  let firstTs: string | null = null;
  for (let i = 0; i < chunks.length; i++) {
    const text = i === 0 ? chunks[i] : `${continuationHeader}\n\n${chunks[i]}`;
    try {
      const result = (await postMessage(channel, text)) as { ts?: string };
      if (i === 0) firstTs = result?.ts ?? null;
    } catch {
      /* best-effort */
    }
  }
  return firstTs;
}

function isManager(role: string | null): boolean {
  return role === "admin" || role === "owner";
}

interface ReportBody {
  name: string;
  week: string;
  week_start?: string;
  blockers?: string;
  escalations?: string;
  priorities?: string;
  goals_met?: string;
  win?: string;
  accomplishments?: string;
  friction?: string;
  went_well?: string;
  support_needed?: string;
  whats_new?: string;
  task_statuses?: string;
}

interface AiAnalysis {
  summary: string;
  insights: string[];
  actions: string[];
}

async function analyzeReport(report: ReportBody): Promise<AiAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY_REPORTS;
  if (!apiKey) return null;

  // Explicit baseURL - see app/api/chat/route.ts for why (Netlify AI Gateway
  // silently injects ANTHROPIC_BASE_URL, which the SDK would otherwise use).
  const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com" });

  const prompt = `You are analyzing a weekly report from ${report.name} for the week of ${report.week}. Provide a concise executive analysis.

Report:
1. Blocked/stuck/at risk: ${report.blockers || "-"}
2. Escalations needed: ${report.escalations || "-"}
3. Next week priorities: ${report.priorities || "-"}
4. Last week priorities - done vs. not done: ${report.goals_met || "-"}
5. Most important accomplishment & business impact: ${report.win || "-"}
6. Full accomplishments by area: ${report.accomplishments || "-"}
7. What didn't go well: ${report.friction || "-"}
8. What went well: ${report.went_well || "-"}
9. Support needed from others: ${report.support_needed || "-"}

Respond with valid JSON only:
{
  "summary": "2-3 sentence executive summary of this person's week",
  "insights": ["2-4 key observations about performance, patterns, or growth areas"],
  "actions": ["2-3 specific recommended actions for management to consider"]
}`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as AiAnalysis;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: ReportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { week } = body;
  let { name } = body;
  if (!week) {
    return NextResponse.json({ error: "week is required" }, { status: 400 });
  }

  // Non-managers may only submit a report as themselves - ignore any client-set
  // name and force their own mapped full name. Managers can submit for anyone.
  const role = req.headers.get("x-role");
  const username = req.headers.get("x-user");
  if (!isManager(role)) {
    const member = username ? await getTeamMemberByUsername(username) : null;
    if (!member?.full_name) {
      return NextResponse.json(
        {
          error:
            "Your account is not linked to a team member, so you cannot submit a report. Contact an admin.",
        },
        { status: 403 },
      );
    }
    name = member.full_name;
  }
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  body.name = name;

  // Reject reports for a week that hasn't happened yet.
  if (body.week_start) {
    const selectedMonday = parseWeekStart(body.week_start);
    if (selectedMonday.getTime() > getMondayOfWeekPT().getTime()) {
      return NextResponse.json(
        { error: `You can't submit a report for a future week (${week}).` },
        { status: 400 },
      );
    }
  }

  // Reject a report with every content field left empty.
  const contentFields = [
    body.blockers,
    body.escalations,
    body.priorities,
    body.goals_met,
    body.win,
    body.accomplishments,
    body.friction,
    body.went_well,
    body.support_needed,
  ];
  if (contentFields.every((f) => !f || !f.trim())) {
    return NextResponse.json(
      {
        error:
          "The weekly report is blank. Please complete the required fields before submitting.",
      },
      { status: 400 },
    );
  }

  const openTasksLines = await buildOpenTasksLines(name, body.task_statuses);

  const atoms: string[] = [
    "#myweeklyreport",
    `*Weekly Report - ${name} - ${week}*`,
    "*0. Your Open Tasks*",
    ...openTasksLines,
    `*1. Beyond the open tasks listed above, is anything else blocked, stuck, or at risk right now?*\n${body.blockers || "-"}`,
    `*2. Is anything broken, behind, or needs to be escalated?*\n${body.escalations || "-"}`,
    `*3. Top 3–5 priorities for next week - each with a specific date you're committing to*\n${body.priorities || "-"}`,
    `*4. Last week's priorities - including the open tasks listed above - done vs. not done*\n${body.goals_met || "-"}`,
    `*5. Most important accomplishment & business impact*\n${body.win || "-"}`,
    `*6. Full accomplishments by area*\n${body.accomplishments || "-"}`,
    `*7. What didn't go well - and what should change?*\n${body.friction || "-"}`,
    `*8. What went well that's worth repeating or recognizing?*\n${body.went_well || "-"}`,
    `*9. What you need from others to support you - including anyone blocking the open tasks listed above*\n${body.support_needed || "-"}`,
  ];
  if (body.whats_new) atoms.push(`*10. Personal notes*\n${body.whats_new}`);

  const [analysisResult, slackResult] = await Promise.allSettled([
    analyzeReport(body),
    postWeeklyReportMessage(SLACK_CHANNEL, name, week, atoms),
  ]);

  const aiAnalysis =
    analysisResult.status === "fulfilled" ? analysisResult.value : null;
  const slackTs = slackResult.status === "fulfilled" ? slackResult.value : null;

  const sb = getSupabase();
  const fields = {
    submitted_by: name,
    week_label: week,
    blockers: body.blockers ?? null,
    escalations: body.escalations ?? null,
    priorities: body.priorities ?? null,
    goals_met: body.goals_met ?? null,
    win: body.win ?? null,
    accomplishments: body.accomplishments ?? null,
    friction: body.friction ?? null,
    went_well: body.went_well ?? null,
    support_needed: body.support_needed ?? null,
    whats_new: body.whats_new ?? null,
    ai_analysis: aiAnalysis,
    slack_ts: slackTs,
  };

  // Resubmitting for a week you already filed (e.g. correcting the week you
  // picked) edits that report in place instead of creating a duplicate row.
  const { data: existing } = await sb
    .from("weekly_reports")
    .select("id")
    .eq("submitted_by", name)
    .eq("week_label", week)
    .maybeSingle();

  const { data, error } = existing
    ? await sb
        .from("weekly_reports")
        .update(fields)
        .eq("id", existing.id)
        .select("id")
        .single()
    : await sb.from("weekly_reports").insert(fields).select("id").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    id: data.id,
    analysis: aiAnalysis,
  });
}

export async function GET(req: NextRequest) {
  const role = req.headers.get("x-role");
  if (!role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weekStart = req.nextUrl.searchParams.get("week_start");

  // Non-managers may only read their own reports.
  let ownName: string | null = null;
  if (!isManager(role)) {
    const username = req.headers.get("x-user");
    const member = username ? await getTeamMemberByUsername(username) : null;
    // Unlinked non-manager → no reports they can see.
    if (!member?.full_name) return NextResponse.json([]);
    ownName = member.full_name;
  }

  const sb = getSupabase();
  let query = sb
    .from("weekly_reports")
    .select(
      "id, submitted_by, week_label, blockers, escalations, priorities, goals_met, win, accomplishments, friction, went_well, support_needed, whats_new, ai_analysis, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (ownName) query = query.eq("submitted_by", ownName);

  if (weekStart) {
    // Use both the correct PT label and the IST-shifted variant (1 day earlier).
    // Old reports from IST users stored labels 1 day back due to the midnight-IST bug.
    const labels = weekLabelVariants(parseWeekStart(weekStart));
    query = query.in("week_label", labels);
  }

  const { data } = await query;
  return NextResponse.json(data ?? []);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
