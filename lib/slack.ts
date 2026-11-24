const BASE = "https://slack.com/api";

function headers() {
  return {
    Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN ?? ""}`,
    "Content-Type": "application/json",
  };
}

export async function slackGet(
  method: string,
  params: Record<string, string> = {},
) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/${method}${qs ? "?" + qs : ""}`, {
    headers: headers(),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Slack ${method} ${res.status}`);
  return res.json();
}

export async function postMessage(channel: string, text: string) {
  const res = await fetch(`${BASE}/chat.postMessage`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ channel, text }),
  });
  if (!res.ok) throw new Error(`Slack postMessage ${res.status}`);
  // Slack answers HTTP 200 with { ok: false, error } for failures such as
  // channel_not_found / not_in_channel - surface those instead of treating the
  // post as sent.
  const data = await res.json();
  if (!data.ok)
    throw new Error(
      `Slack postMessage to ${channel}: ${data.error ?? "failed"}`,
    );
  return data;
}

export async function authTest() {
  return slackGet("auth.test");
}

export async function channelHistory(
  channel: string,
  oldest: string,
  limit = "100",
) {
  return slackGet("conversations.history", { channel, oldest, limit });
}

/**
 * Every message in `channel` since `oldest`, following Slack's pagination.
 * Throws when Slack answers ok:false, so a failed read is never mistaken for
 * an empty channel (which would mark everyone as missing their report).
 */
export async function fullChannelHistory(
  channel: string,
  oldest: string,
): Promise<{ messages: unknown[] }> {
  const messages: unknown[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const data = await slackGet("conversations.history", {
      channel,
      oldest,
      limit: "200",
      ...(cursor ? { cursor } : {}),
    });
    if (!data.ok)
      throw new Error(
        `Slack conversations.history ${channel}: ${data.error ?? "failed"}`,
      );
    messages.push(...(data.messages ?? []));
    cursor = data.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  return { messages };
}

/**
 * Channel history since `oldest` plus every thread reply posted since then,
 * so a report someone posts as a reply (e.g. under the daily reminder) is
 * seen too. Replies already broadcast to the channel are not duplicated.
 */
export async function channelHistoryWithReplies(
  channel: string,
  oldest: string,
): Promise<{ messages: unknown[] }> {
  const { messages } = await fullChannelHistory(channel, oldest);
  type Parent = { ts?: string; reply_count?: number; latest_reply?: string };
  const threads = (messages as Parent[]).filter(
    (m) =>
      m.ts &&
      (m.reply_count ?? 0) > 0 &&
      parseFloat(m.latest_reply ?? "0") >= parseFloat(oldest),
  );
  const seen = new Set((messages as Parent[]).map((m) => m.ts));
  // Sequential: a handful of threads per fortnight, and conversations.replies
  // is rate limited.
  for (const parent of threads) {
    let cursor = "";
    for (let page = 0; page < 10; page++) {
      const data = await slackGet("conversations.replies", {
        channel,
        ts: parent.ts!,
        oldest,
        limit: "200",
        ...(cursor ? { cursor } : {}),
      });
      if (!data.ok)
        throw new Error(
          `Slack conversations.replies ${channel}: ${data.error ?? "failed"}`,
        );
      for (const r of (data.messages ?? []) as Parent[]) {
        if (!r.ts || seen.has(r.ts)) continue; // parent or broadcast reply
        seen.add(r.ts);
        messages.push(r);
      }
      cursor = data.response_metadata?.next_cursor ?? "";
      if (!cursor) break;
    }
  }
  return { messages };
}

export async function userInfo(user: string) {
  return slackGet("users.info", { user });
}

export async function usersList() {
  return slackGet("users.list");
}

export async function conversationsList() {
  // channels:read scope - public channels only
  return slackGet("conversations.list", {
    types: "public_channel",
    limit: "200",
  });
}

// ── Phase 3: channel message ingestion ───────────────────────────────────────
export interface SlackMessage {
  channel: string; // channel name
  user: string; // resolved display name
  text: string;
  ts: string; // ISO time
  tsMs: number;
}

const MAX_INGEST_CHANNELS = 20;
const PER_CHANNEL = 30;
const INGEST_DAYS = 7;

// Pull recent messages from channels the bot is a member of, resolve authors,
// and return a deduped, time-sorted feed. Stored as the `slack-messages` cache.
export async function buildSlackMessagesSnapshot(): Promise<{
  messages: SlackMessage[];
  byChannel: Record<string, number>;
  channelCount: number;
}> {
  const oldest = String(
    Math.floor((Date.now() - INGEST_DAYS * 86400000) / 1000),
  );

  const [channelsData, usersData] = await Promise.all([
    conversationsList(),
    usersList(),
  ]);
  const channels: Array<{
    id: string;
    name: string;
    is_member?: boolean;
    is_archived?: boolean;
  }> = (channelsData as { channels?: typeof channels }).channels ?? [];
  const users: Array<{ id: string; real_name?: string; name?: string }> =
    (usersData as { members?: typeof users }).members ?? [];
  const userMap: Record<string, string> = {};
  for (const u of users)
    if (u.id) userMap[u.id] = u.real_name ?? u.name ?? "Unknown";

  const active = channels
    .filter((c) => c.is_member && !c.is_archived)
    .slice(0, MAX_INGEST_CHANNELS);

  const out: SlackMessage[] = [];
  const byChannel: Record<string, number> = {};
  await Promise.all(
    active.map(async (c) => {
      try {
        const hist = await channelHistory(c.id, oldest, String(PER_CHANNEL));
        const msgs: Array<{
          user?: string;
          text?: string;
          ts?: string;
          subtype?: string;
          bot_id?: string;
        }> = (hist as { messages?: typeof msgs }).messages ?? [];
        for (const m of msgs) {
          const text = (m.text ?? "").trim();
          if (
            !text ||
            m.subtype === "channel_join" ||
            m.subtype === "channel_leave"
          )
            continue;
          const tsMs = parseFloat(m.ts ?? "0") * 1000;
          out.push({
            channel: c.name,
            user: m.user
              ? (userMap[m.user] ?? "Unknown")
              : m.bot_id
                ? "Bot"
                : "Unknown",
            text: text.length > 400 ? text.slice(0, 400) + "…" : text,
            ts: new Date(tsMs).toISOString(),
            tsMs,
          });
          byChannel[c.name] = (byChannel[c.name] ?? 0) + 1;
        }
      } catch {
        /* skip channels the bot can't read */
      }
    }),
  );

  out.sort((a, b) => b.tsMs - a.tsMs);
  return {
    messages: out.slice(0, 200),
    byChannel,
    channelCount: active.length,
  };
}

import { SLACK_CHANNEL_WEEKLY_REPORTS } from "@/lib/constants";
import { getTeamMembers } from "@/lib/team-db";
import { reportersForWeek, namesWhoFiled } from "@/lib/weekly-reports-db";

import {
  getMondayOfWeekPT,
  fmtWeekRange,
  shiftWeeks,
  weekLabelVariants,
} from "./week-utils";
import { reportDeadlinePassed } from "./report-status";

export function weekLabel(): string {
  return fmtWeekRange(getMondayOfWeekPT());
}

export type ChannelMessage = {
  user?: string;
  username?: string;
  subtype?: string;
  bot_id?: string;
  ts?: string;
  text?: string;
};

// Section names from the Slack template and the VCoS report form. Used to
// recognise a report posted without the #myweeklyreport tag.
const REPORT_SECTION_HEADINGS = [
  "business outcomes",
  "top goals",
  "deliverables",
  "automation",
  "processes executed",
  "deals & relationships",
  "blocked or at risk",
  "blockers",
  "escalation",
  "most interesting",
  "priorities",
  "next week",
  "last week",
  "win of the week",
  "most important",
  "accomplishments",
  "went well",
  "go well",
  "what i need",
  "what you need",
  "kudos",
  "friction",
  "personal notes",
  "what's new",
];

// A short first line that names the post as a report, e.g. "Ben's weekly
// update", "Weekly Progress Report 10th - 14th August", "My weekly report".
const REPORT_TITLE = /weekly (report|update)|progress report|status report/i;

/**
 * A message counts as a weekly report when it carries #myweeklyreport, or
 * when a person (not a bot) posts something report-shaped without the tag
 * (e.g. Ben's Nov 13 report) - that must not trigger daily reminders:
 *   - at least 4 numbered report sections, or
 *   - a short report-style title line plus 2+ sections or a substantial body.
 */
export function isWeeklyReportMessage(m: ChannelMessage): boolean {
  const text = m.text ?? "";
  if (text.toLowerCase().includes("#myweeklyreport")) return true;
  // thread_broadcast = a thread reply also sent to the channel; still a
  // person's own post. Other subtypes (joins, bot posts, ...) never count.
  if (m.bot_id || !m.user) return false;
  if (m.subtype && m.subtype !== "thread_broadcast") return false;
  const sections = (text.match(/^\s*\*?\d{1,2}\.\s+[^\n]{1,80}/gm) ?? [])
    .map((line) => line.toLowerCase())
    .filter((line) => REPORT_SECTION_HEADINGS.some((h) => line.includes(h)));
  if (sections.length >= 4) return true;
  // A title, not a sentence: "Yes, let's keep ... for the status report."
  // is a chat reply, "Ben's weekly update" is a report heading.
  const firstLine = (text.trim().split("\n")[0] ?? "").replace(/[*_\s]+$/, "");
  const hasTitle =
    firstLine.length <= 80 &&
    !/[.?!]$/.test(firstLine) &&
    REPORT_TITLE.test(firstLine);
  return hasTitle && (sections.length >= 2 || text.length >= 400);
}

// "*Weekly Report - <name> - <week label>*" header of a report submitted
// through VCoS (app/api/weekly-reports). Continuation posts end "(continued)".
const VCOS_REPORT_HEADER =
  /\*Weekly Report - (.+?) - (.+?)(?: \(continued\))?\*/;

/**
 * Is this report message FOR the week starting `weekMonday`?
 *
 * A report is often posted after its week ends (Rob's Nov 9-13 report went in
 * on Mon Nov 16), so the posting date alone must not decide the week - that
 * made a late report for one week count as on time for the next, and the
 * reminder skipped people who had not filed. VCoS posts name their week in the
 * header, so that wins. A hand-written post counts for the week it was most
 * likely written for: anything from Thursday through the following Wednesday
 * belongs to that Thursday's week (posting time shifted back 3 days).
 */
export function isReportForWeek(m: ChannelMessage, weekMonday: Date): boolean {
  const label = VCOS_REPORT_HEADER.exec(m.text ?? "")?.[2];
  if (label) return weekLabelVariants(weekMonday).includes(label.trim());
  const ts = parseFloat(m.ts ?? "0") * 1000;
  if (!ts) return false;
  const shifted = new Date(ts - 3 * 24 * 60 * 60 * 1000);
  return (
    getMondayOfWeekPT(shifted).getTime() ===
    getMondayOfWeekPT(weekMonday).getTime()
  );
}

/** Names/handles of everyone who posted a weekly report FOR the given week. */
export function getPostersFromMessages(
  messages: ChannelMessage[],
  userMap: Record<string, string>,
  handleMap: Record<string, string>,
  weekMonday: Date,
) {
  const window = messages.filter(
    (m) => isWeeklyReportMessage(m) && isReportForWeek(m, weekMonday),
  );
  return {
    names: Array.from(
      new Set([
        ...window.map((m) => (m.user ? userMap[m.user] : "")).filter(Boolean),
        // Reports submitted through VCoS are posted by the VCOS Bot user, so
        // the poster is always "VCOS Bot" - the real author is only in the
        // "*Weekly Report - <name> - <week>*" header (app/api/weekly-reports).
        ...window
          .map((m) => VCOS_REPORT_HEADER.exec(m.text ?? "")?.[1])
          .filter((n): n is string => !!n),
        ...window
          .filter((m) => m.subtype === "bot_message" && m.username)
          .map((m) => m.username!),
      ]),
    ),
    handles: Array.from(
      new Set(
        window.map((m) => (m.user ? handleMap[m.user] : "")).filter(Boolean),
      ),
    ),
  };
}

function matchesAlias(text: string, alias: string): boolean {
  const t = text.toLowerCase();
  const a = alias.toLowerCase();
  // Exact match, or alias appears as a whole word at start/end of the name
  return (
    t === a ||
    t.startsWith(a + " ") ||
    t.endsWith(" " + a) ||
    t.includes(" " + a + " ")
  );
}

export function whoFiled(
  names: string[],
  handles: string[],
  reportMembers: Array<{ full_name: string; slack_aliases: string[] }>,
): string[] {
  const filed: string[] = [];
  for (const member of reportMembers) {
    // The full name always counts too - VCoS-submitted reports carry it in
    // their header, and custom aliases (e.g. a nickname) don't include it.
    const aliases = member.slack_aliases.length
      ? [...member.slack_aliases, member.full_name]
      : [member.full_name.split(" ")[0].toLowerCase(), member.full_name];
    const didFile =
      names.some((p) => aliases.some((a) => matchesAlias(p, a))) ||
      handles.some((h) => aliases.some((a) => matchesAlias(h, a)));
    if (didFile) filed.push(member.full_name);
  }
  return filed;
}

export async function buildSlackSnapshot() {
  const now = new Date();

  // Week 2 = this week, Week 1 = last week.
  const week2Start = getMondayOfWeekPT(now);
  const week1Start = shiftWeeks(week2Start, -1);
  // The week whose report is currently due: this week once its Friday
  // deadline has passed (Sat/Sun), otherwise last week. "Missing" is judged
  // against this one week only - filing this week's report must not hide a
  // missing report for last week.
  const dueStart = reportDeadlinePassed(week2Start, now)
    ? week2Start
    : week1Start;

  // Hand-written reports for last week can be posted as early as its
  // Thursday, so read from then.
  const oldest = String(
    Math.floor((week1Start.getTime() - 4 * 24 * 60 * 60 * 1000) / 1000),
  );

  const [
    historyData,
    membersData,
    channelsData,
    teamMembers,
    dbWeek1,
    dbWeek2,
  ] = await Promise.all([
    channelHistoryWithReplies(SLACK_CHANNEL_WEEKLY_REPORTS, oldest),
    usersList(),
    conversationsList(),
    getTeamMembers(),
    // Reports in the weekly_reports table - filed through VCoS or marked as
    // submitted by an admin - count too, so a report shared outside the
    // #weeklyreports channel never triggers the daily reminder.
    reportersForWeek(week1Start).catch(() => [] as string[]),
    reportersForWeek(week2Start).catch(() => [] as string[]),
  ]);

  // Without the user list, people's own posts can't be tied to a name and
  // everyone who posted manually would be flagged as missing.
  if (!(membersData as { ok?: boolean }).ok)
    throw new Error(
      `Slack users.list: ${(membersData as { error?: string }).error ?? "failed"}`,
    );

  const reportMembers = teamMembers.filter((m) => m.files_report);
  const allMemberNames = teamMembers.map((m) => m.full_name);

  const allUsers: Array<{
    id: string;
    real_name?: string;
    name?: string;
    deleted?: boolean;
    is_bot?: boolean;
  }> = (membersData as { members?: typeof allUsers }).members ?? [];

  const userMap: Record<string, string> = {};
  const handleMap: Record<string, string> = {};
  for (const u of allUsers) {
    if (u.id) {
      userMap[u.id] = u.real_name ?? u.name ?? "";
      handleMap[u.id] = u.name ?? "";
    }
  }

  const messages: ChannelMessage[] =
    (historyData as { messages?: typeof messages }).messages ?? [];

  // Week 1 and Week 2 filing detection
  const week1 = getPostersFromMessages(messages, userMap, handleMap, week1Start);
  const week2 = getPostersFromMessages(messages, userMap, handleMap, week2Start);

  const reportNames = reportMembers.map((m) => m.full_name);
  const filedWeek1 = Array.from(
    new Set([
      ...whoFiled(week1.names, week1.handles, reportMembers),
      ...namesWhoFiled(reportNames, dbWeek1),
    ]),
  );
  const filedWeek2 = Array.from(
    new Set([
      ...whoFiled(week2.names, week2.handles, reportMembers),
      ...namesWhoFiled(reportNames, dbWeek2),
    ]),
  );

  const filed = dueStart === week2Start ? filedWeek2 : filedWeek1;
  const missing = allMemberNames.filter(
    (n) => reportMembers.some((m) => m.full_name === n) && !filed.includes(n),
  );

  // Group tagged reports by day (YYYY-MM-DD)
  const dayCounts: Record<string, number> = {};
  for (const msg of messages) {
    if (msg.ts && isWeeklyReportMessage(msg)) {
      const d = new Date(parseFloat(msg.ts) * 1000).toISOString().slice(0, 10);
      dayCounts[d] = (dayCounts[d] ?? 0) + 1;
    }
  }
  const messagesByDay = Object.entries(dayCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const week1Label = fmtWeekRange(week1Start);
  const week2Label = fmtWeekRange(week2Start);

  return {
    weeklyReports: {
      filed,
      missing,
      // The week `filed` / `missing` refer to (the report currently due).
      week: fmtWeekRange(dueStart),
      filedWeek1,
      filedWeek2,
      week1Label,
      week2Label,
    },
    slackStats: {
      totalMessages: messages.length,
      activeMembers: allUsers.filter((m) => !m.deleted && !m.is_bot).length,
      channels: ((channelsData as { channels?: unknown[] }).channels ?? [])
        .length,
      messagesByDay,
    },
  };
}
