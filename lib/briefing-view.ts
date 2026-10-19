// Briefing Room view logic (client-safe, no server imports). Ported from the
// original handoff page so status, ordering and "what changed" behave the same.

export interface BLink {
  label: string;
  url: string;
}
export interface BMeeting {
  id: string;
  date?: string;
  title?: string;
  kind?: string;
  periodStart?: string;
  periodEnd?: string;
  preparedAt?: string;
  questionsDue?: string;
  status?: string;
  notes?: string;
  conflicts?: string;
  entryCount?: number;
  summary?: string;
  auditNote?: string;
  auditSource?: BLink;
  dataThrough?: string;
  sourceLinks?: BLink[];
}
export type Health = "noresponse" | "stuck" | "decision" | "moving" | "quiet";
export type Urgency = "high" | "watch" | "normal";
export interface BEntry {
  id: string;
  meetingId: string;
  kind: "client" | "relationship";
  order?: number;
  name: string;
  owner?: string;
  headline?: string;
  brief?: string;
  meetings?: string;
  emails?: string;
  urgency?: Urgency;
  urgentReason?: string;
  sources?: BLink[];
  health?: Health;
  done?: string;
  stuck?: string;
  next?: string;
  slack?: string;
  teamNote?: string;
  teamNoteBy?: string;
  teamNoteAt?: number;
}
export type AuditStatus = "noreply" | "late" | "replied" | "handled";
export interface BAudit {
  id: string;
  meetingId: string;
  order?: number;
  party: string;
  subject?: string;
  owner?: string;
  ownerKey?: string;
  status: AuditStatus;
  ageDays?: number | string;
  inbound?: string;
  done?: string;
  next?: string;
  links?: BLink[];
  entryId?: string;
}
export interface BLog {
  id: string;
  meetingId: string;
  order?: number;
  when?: string;
  meeting?: string;
  attendees?: string;
  outcome?: string;
  link?: string;
}
export interface BWaiting {
  id: string;
  meetingId: string;
  order?: number;
  item?: string;
  who?: string;
  source?: string;
}
export interface BQuestion {
  id: string;
  meetingId: string;
  who?: string;
  topic?: string;
  text: string;
  answer?: string;
  status?: "open" | "answered";
  late?: boolean;
  createdAt?: number;
}

export const TEAM = ["Josh", "Alex", "Rob", "Sam", "Ben", "Kim", "Darryl"];
export const PEOPLE = [...TEAM, "Tony"];
export const PERSON_COLORS: Record<string, string> = {
  Josh: "#2F57D0",
  Alex: "#1C7C54",
  Rob: "#B8562A",
  Sam: "#6B49B8",
  Ben: "#13808C",
  Kim: "#B03A7F",
  Darryl: "#56627F",
  Tony: "#0F1B33",
};

/** Label + colour token (matches .pill / .tile / .kpi colour classes). */
export const HEALTH: Record<Health, { label: string; color: string; rank: number }> = {
  noresponse: { label: "Not responded", color: "red", rank: 0 },
  stuck: { label: "Stuck", color: "amber", rank: 1 },
  decision: { label: "Needs Tony", color: "blue", rank: 2 },
  moving: { label: "Moving", color: "green", rank: 3 },
  quiet: { label: "Quiet", color: "slate", rank: 4 },
};
export const HEALTH_ORDER = Object.keys(HEALTH) as Health[];

export const AUDIT: Record<AuditStatus, { label: string; color: string }> = {
  noreply: { label: "No real reply", color: "red" },
  late: { label: "Late or acknowledged only", color: "amber" },
  replied: { label: "Replied since the audit", color: "blue" },
  handled: { label: "Handled", color: "green" },
};
export const AUDIT_ORDER = Object.keys(AUDIT) as AuditStatus[];

export const isNone = (t?: string) =>
  !t || /^\s*(none|no thread|no meeting|see brief)/i.test(t);
export const safeUrl = (u?: string) =>
  /^https?:\/\//i.test(String(u ?? "").trim()) ? String(u).trim() : "";
export const norm = (s: unknown) =>
  String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const URG_RE =
  /overdue|unanswered|no (written )?(reply|answer|status)|not (yet )?sent|stalled|unsent|still unresolved/i;
export function urgencyOf(e: BEntry): Urgency {
  if (e.urgency === "high" || e.urgency === "watch" || e.urgency === "normal")
    return e.urgency;
  return URG_RE.test(`${e.brief ?? ""} ${e.emails ?? ""}`) ? "watch" : "normal";
}
export function healthOf(e: BEntry): Health {
  if (e.health && HEALTH[e.health]) return e.health;
  return urgencyOf(e) === "normal" ? "moving" : "stuck";
}
export function headlineOf(e: BEntry): string {
  if (e.headline) return e.headline;
  if (e.urgentReason) return e.urgentReason;
  const b = String(e.brief ?? "");
  const i = b.search(/[.!?]\s/);
  const s = i > 0 ? b.slice(0, i + 1) : b;
  return s.length > 120 ? s.slice(0, 117) + "…" : s;
}
export const ownerNames = (owner?: string) =>
  PEOPLE.filter((n) => new RegExp(`\\b${n}\\b`).test(owner ?? ""));
export const meetingItems = (e: BEntry) =>
  isNone(e.meetings)
    ? []
    : String(e.meetings).split(" · ").map((s) => s.trim()).filter(Boolean);
export const ageText = (a: BAudit) =>
  a.ageDays != null && a.ageDays !== ""
    ? `${a.ageDays} ${Number(a.ageDays) === 1 ? "day" : "days"}`
    : "";

/** Sort: worst health first, then urgency, then the record's own order. */
export function entryRank(e: BEntry) {
  const u = urgencyOf(e);
  return HEALTH[healthOf(e)].rank * 10 + (u === "high" ? 0 : u === "watch" ? 1 : 2);
}
export const byEntryRank = (a: BEntry, b: BEntry) =>
  entryRank(a) - entryRank(b) || (a.order ?? 0) - (b.order ?? 0);
export const byOrder = (a: { order?: number }, b: { order?: number }) =>
  (a.order ?? 0) - (b.order ?? 0);

/** "Mon, Oct 19" from YYYY-MM-DD (calendar date, no timezone shift). */
export function fmtDay(iso?: string) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
/** "Mon, Oct 19, 9:00 AM PT" from an ISO timestamp or epoch ms. */
export function fmtPT(when?: string | number) {
  if (when == null || when === "") return "";
  return (
    new Date(when).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " PT"
  );
}

/** Parse "Label | https://…" lines (one per line) into links. */
export function parseLinks(text: string): BLink[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.lastIndexOf("|");
      const label = i >= 0 ? l.slice(0, i).trim() : "Source";
      const url = safeUrl(i >= 0 ? l.slice(i + 1) : l);
      return url ? { label: label || "Source", url } : null;
    })
    .filter((x): x is BLink => !!x);
}
export const linksToText = (links?: BLink[]) =>
  (links ?? []).map((x) => `${x.label} | ${x.url}`).join("\n");

// ── What changed since the previous record ──────────────────────────────────
export type EntryChange =
  | { state: "new" }
  | { state: "same" }
  | { state: "upd"; fields: ("brief" | "meetings" | "emails")[]; prev: BEntry };
export type Diff =
  | { state: "first" }
  | { state: "loading"; prev: BMeeting }
  | { state: "nobase"; prev: BMeeting }
  | {
      state: "ok";
      prev: BMeeting;
      by: Record<string, EntryChange>;
      added: BEntry[];
      updated: BEntry[];
      same: BEntry[];
      dropped: BEntry[];
      waitingNew: BWaiting[];
      waitingGone: BWaiting[];
    };

export function computeDiff(
  prev: BMeeting | null,
  prevLoaded: boolean,
  entries: BEntry[],
  prevEntries: BEntry[],
  waiting: BWaiting[],
  prevWaiting: BWaiting[],
): Diff {
  if (!prev) return { state: "first" };
  if (!prevLoaded) return { state: "loading", prev };
  if (!prevEntries.length) return { state: "nobase", prev };
  const key = (e: BEntry) => `${e.kind}|${norm(e.name)}`;
  const before = new Map(prevEntries.map((e) => [key(e), e]));
  const by: Record<string, EntryChange> = {};
  const added: BEntry[] = [], updated: BEntry[] = [], same: BEntry[] = [];
  for (const e of entries) {
    const p = before.get(key(e));
    if (!p) {
      by[e.id] = { state: "new" };
      added.push(e);
      continue;
    }
    const fields = (["brief", "meetings", "emails"] as const).filter(
      (f) => norm(e[f]) !== norm(p[f]),
    );
    if (fields.length) {
      by[e.id] = { state: "upd", fields: [...fields], prev: p };
      updated.push(e);
    } else {
      by[e.id] = { state: "same" };
      same.push(e);
    }
  }
  const now = new Set(entries.map(key));
  const pw = new Set(prevWaiting.map((w) => norm(w.item)));
  const cw = new Set(waiting.map((w) => norm(w.item)));
  return {
    state: "ok",
    prev,
    by,
    added,
    updated,
    same,
    dropped: prevEntries.filter((p) => !now.has(key(p))),
    waitingNew: waiting.filter((w) => !pw.has(norm(w.item))),
    waitingGone: prevWaiting.filter((w) => !cw.has(norm(w.item))),
  };
}
