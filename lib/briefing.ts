// Briefing Room store - the CEO Command Centre for the Monday/Thursday team
// meetings. Documents live in one generic table (scripts/briefing-room-schema.sql)
// so the page's original document model maps 1:1: collection + id + data.
import { getSupabase } from "./supabase";
import { getTeamMemberByUsername, getTeamMembers } from "./team-db";
import { BRIEFING_VIEW_ONLY_USERNAMES } from "./constants";
import { getCached } from "./api-cache";
import type { Meeting } from "./types";

export const BRIEFING_COLLECTIONS = [
  "meetings",
  "entries",
  "audit",
  "log",
  "waiting",
  "questions",
] as const;
export type BriefingCollection = (typeof BRIEFING_COLLECTIONS)[number];

export function isBriefingCollection(c: unknown): c is BriefingCollection {
  return (
    typeof c === "string" &&
    (BRIEFING_COLLECTIONS as readonly string[]).includes(c)
  );
}

export type BriefingData = Record<string, unknown>;
export interface BriefingDoc {
  id: string;
  data: BriefingData;
}

// Fields owned by the team (Status / Comments). Scheduled research jobs must
// never overwrite them - they're carried forward when a job replaces an entry.
const TEAM_NOTE_FIELDS = ["teamNote", "teamNoteBy", "teamNoteAt"];
// Fields owned by the ClickUp comment sync - only the scheduled jobs write them.
const CU_SYNC_FIELDS = ["cuSyncedNote", "cuSyncedAt"];
// The only fields a view-only reader (Tony) may change, on questions.
const ANSWER_FIELDS = ["answer", "status"];

/** Who is calling: a scheduled job, a team editor, or a view-only reader. */
export type BriefingActor =
  | { kind: "service"; name: string }
  | { kind: "editor"; name: string }
  | { kind: "viewer"; name: string };

export async function actorFromSession(
  username: string,
): Promise<BriefingActor> {
  const member = await getTeamMemberByUsername(username).catch(() => null);
  const name = member?.full_name ?? username;
  return BRIEFING_VIEW_ONLY_USERNAMES.includes(username.toLowerCase())
    ? { kind: "viewer", name }
    : { kind: "editor", name };
}

const omit = (data: BriefingData, keys: string[]): BriefingData =>
  Object.fromEntries(Object.entries(data).filter(([k]) => !keys.includes(k)));
const pick = (data: BriefingData, keys: string[]): BriefingData =>
  Object.fromEntries(Object.entries(data).filter(([k]) => keys.includes(k)));

/**
 * Apply the field-ownership rules to an incoming write. Returns the data that
 * may be written, or an error string when the write isn't allowed at all.
 */
export function guardWrite(
  actor: BriefingActor,
  op: "set" | "update" | "add" | "delete",
  collection: BriefingCollection,
  data: BriefingData,
): { data: BriefingData } | { error: string } {
  if (actor.kind === "viewer") {
    const onlyAnswers = Object.keys(data).every((k) =>
      ANSWER_FIELDS.includes(k),
    );
    if (collection !== "questions" || op !== "update" || !onlyAnswers)
      return { error: "View-only access: you can answer questions only." };
    return { data };
  }
  if (actor.kind === "service") return { data: omit(data, TEAM_NOTE_FIELDS) };
  return { data: omit(data, CU_SYNC_FIELDS) };
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function listDocs(
  collection: BriefingCollection,
  meetingId?: string | null,
): Promise<BriefingDoc[]> {
  let q = getSupabase()
    .from("briefing_docs")
    .select("id, data")
    .eq("collection", collection);
  if (meetingId) q = q.eq("meeting_id", meetingId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as BriefingDoc[]).filter((d) => !d.data.hidden);
}

export async function getDoc(
  collection: BriefingCollection,
  id: string,
): Promise<BriefingDoc | null> {
  const { data, error } = await getSupabase()
    .from("briefing_docs")
    .select("id, data")
    .eq("collection", collection)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BriefingDoc | null) ?? null;
}

// ── Writes ──────────────────────────────────────────────────────────────────

const meetingIdOf = (collection: BriefingCollection, id: string, d: BriefingData) =>
  collection === "meetings"
    ? id
    : typeof d.meetingId === "string"
      ? d.meetingId
      : null;

/** Replace a document. A job replacing an entry keeps the team's note and sync fields. */
export async function setDoc(
  actor: BriefingActor,
  collection: BriefingCollection,
  id: string,
  data: BriefingData,
): Promise<void> {
  let next = data;
  if (actor.kind === "service") {
    const prev = await getDoc(collection, id);
    if (prev) {
      // Keep team-owned fields; keep sync fields unless the job sent new ones.
      const keep = pick(prev.data, [...TEAM_NOTE_FIELDS, ...CU_SYNC_FIELDS]);
      next = { ...keep, ...data, ...pick(prev.data, TEAM_NOTE_FIELDS) };
    }
  }
  const { error } = await getSupabase()
    .from("briefing_docs")
    .upsert({
      collection,
      id,
      meeting_id: meetingIdOf(collection, id, next),
      data: next,
      updated_at: new Date().toISOString(),
      updated_by: actor.name,
    });
  if (error) throw new Error(error.message);
}

/** Merge fields into an existing document (atomic, in the database). */
export async function updateDoc(
  actor: BriefingActor,
  collection: BriefingCollection,
  id: string,
  patch: BriefingData,
): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("briefing_merge", {
    p_collection: collection,
    p_id: id,
    p_patch: patch,
    p_by: actor.name,
  });
  if (error) throw new Error(error.message);
  return data != null;
}

export async function deleteDoc(
  collection: BriefingCollection,
  id: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("briefing_docs")
    .delete()
    .eq("collection", collection)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Fireflies → Meeting log ─────────────────────────────────────────────────
// Recordings from the meeting's period that the research job hasn't logged yet
// are added once as ordinary log rows (id ff_<transcriptId>) so the team can
// edit them. Deleting one only hides it, so it isn't re-added on the next poll.

export const FIREFLIES_ROW_PREFIX = "ff_";
const PT = "America/Los_Angeles";
const ptDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(d); // YYYY-MM-DD

function fmtWhen(d: Date, withTime: boolean): string {
  const day = d.toLocaleDateString("en-US", {
    timeZone: PT,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = withTime
    ? d.toLocaleTimeString("en-US", {
        timeZone: PT,
        hour: "numeric",
        minute: "2-digit",
      })
    : "Fireflies";
  return `${day.replace(",", "")}, ${time}`; // "Thu Oct 8, 8:00 AM"
}

// Same privacy rules the research job follows: finance meetings are shown only
// as a withheld line, personal/health meetings are never logged.
const WITHHELD = "Internal finance planning (details withheld)";
const FINANCE_RE = /financ|budget|payroll|salary|tax\b|settlement/i;
const PRIVATE_RE = /personal|health|medical|doctor|therapy/i;

const normTitle = (t: unknown) =>
  String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const firstSentence = (md: string) =>
  md
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*-\s*/gm, "")
    .split(/(?<=[.!?])\s|\n/)
    .map((x) => x.trim())
    .find(Boolean)
    ?.slice(0, 240) ?? "";

/** Recording start; snapshots cached before `startedAt` existed only have a date. */
function recordingStart(m: Meeting): { at: Date; timed: boolean } {
  if (m.startedAt) return { at: new Date(m.startedAt), timed: true };
  return { at: new Date(`${m.date} 12:00 UTC`), timed: false }; // noon UTC = same PT day
}

export async function syncFirefliesIntoLog(meetingId: string): Promise<void> {
  const [meeting, cache] = await Promise.all([
    getDoc("meetings", meetingId),
    getCached("fireflies").catch(() => null),
  ]);
  const recordings = ((cache?.data as { meetings?: Meeting[] } | null)
    ?.meetings ?? []) as Meeting[];
  if (!meeting || !recordings.length) return;
  const from = String(meeting.data.periodStart ?? "");
  if (!from) return;
  // The research job already covered everything up to dataThrough.
  const through = meeting.data.dataThrough
    ? new Date(String(meeting.data.dataThrough))
    : null;

  const { data, error } = await getSupabase()
    .from("briefing_docs")
    .select("id, data")
    .eq("collection", "log")
    .eq("meeting_id", meetingId); // includes hidden rows
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as BriefingDoc[];
  const ids = new Set(rows.map((r) => r.id));
  const links = new Set(rows.map((r) => String(r.data.link ?? "")));
  // "Thu Oct 15|impactsoul team meeting" for every row already logged
  const dayTitles = rows.map((r) => ({
    day: String(r.data.when ?? "").split(",")[0].trim(),
    title: normTitle(r.data.meeting),
  }));
  let order = rows.reduce((m, r) => Math.max(m, Number(r.data.order) || 0), 0);

  const fresh = recordings
    .map((m) => ({ m, ...recordingStart(m) }))
    .filter(({ m, at, timed }) => {
      if (Number.isNaN(at.getTime()) || PRIVATE_RE.test(m.title)) return false;
      const day = ptDay(at);
      if (day < from || day > meetingId) return false;
      if (through && !Number.isNaN(through.getTime())) {
        const covered = timed ? at <= through : day <= ptDay(through);
        if (covered) return false;
      }
      if (ids.has(FIREFLIES_ROW_PREFIX + m.id) || links.has(m.url)) return false;
      const whenDay = fmtWhen(at, false).split(",")[0];
      const t = normTitle(m.title);
      return !dayTitles.some(
        (r) => r.day === whenDay && r.title && (r.title.includes(t) || t.includes(r.title)),
      );
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ m, at, timed }) => {
      const withheld = FINANCE_RE.test(m.title);
      return {
        collection: "log",
        id: FIREFLIES_ROW_PREFIX + m.id,
        meeting_id: meetingId,
        updated_by: "Fireflies",
        data: {
          meetingId,
          order: ++order,
          when: fmtWhen(at, timed),
          meeting: withheld ? WITHHELD : m.title,
          attendees: m.teamParticipants.length
            ? m.teamParticipants.join(", ")
            : `${m.participants.length} attendee${m.participants.length === 1 ? "" : "s"}`,
          outcome: withheld ? WITHHELD : firstSentence(m.overview),
          link: withheld ? "" : m.url,
          source: "fireflies",
        },
      };
    });
  if (!fresh.length) return;
  // ignoreDuplicates: two viewers polling at once can't overwrite each other.
  const { error: insErr } = await getSupabase()
    .from("briefing_docs")
    .upsert(fresh, { ignoreDuplicates: true });
  if (insErr) throw new Error(insErr.message);
}

// ── Team-meeting attendance (per Fireflies) ─────────────────────────────────
// Recordings on the meeting date whose title contains this text count as the
// team meeting.
export const TEAM_MEETING_TITLE = "team meeting";

export interface Attendance {
  recordings: { title: string; url: string; when: string }[];
  joined: string[]; // linked to Fireflies and in a recording
  notSeen: string[]; // linked to Fireflies, in no recording
  notLinked: string[]; // no fireflies_email on their team record
}

export async function attendanceFor(meetingId: string): Promise<Attendance> {
  const [cache, team] = await Promise.all([
    getCached("fireflies").catch(() => null),
    getTeamMembers(),
  ]);
  const recordings = (
    ((cache?.data as { meetings?: Meeting[] } | null)?.meetings ?? []) as Meeting[]
  )
    .map((m) => ({ m, ...recordingStart(m) }))
    .filter(
      ({ m, at }) =>
        !Number.isNaN(at.getTime()) &&
        ptDay(at) === meetingId &&
        m.title.toLowerCase().includes(TEAM_MEETING_TITLE),
    );
  const seen = new Set(
    recordings.flatMap(({ m }) => m.matchedEmails.map((e) => e.toLowerCase())),
  );
  const linked = team.filter((t) => t.fireflies_email);
  return {
    recordings: recordings.map(({ m, at }) => ({
      title: m.title,
      url: m.url,
      when: fmtWhen(at, !!m.startedAt),
    })),
    joined: linked
      .filter((t) => seen.has(t.fireflies_email!.toLowerCase()))
      .map((t) => t.full_name),
    notSeen: linked
      .filter((t) => !seen.has(t.fireflies_email!.toLowerCase()))
      .map((t) => t.full_name),
    notLinked: team.filter((t) => !t.fireflies_email).map((t) => t.full_name),
  };
}

export function newDocId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
