// Team Meeting Prep - Monday/Thursday leadership-meeting cadence, evaluated in PT.
//   Monday meeting   → updates due the Friday before, end of day
//   Thursday meeting → updates due the Wednesday before, end of day
// Mirrors the noon-UTC-anchored PT date pattern in week-utils.ts so the same
// IST-vs-PT off-by-one bug can't recur here.
import type { IconType } from "react-icons";
import {
  FiCheckCircle,
  FiTarget,
  FiAlertTriangle,
  FiUsers,
  FiAlertCircle,
} from "react-icons/fi";
import { ptDateISO } from "./week-utils";

export type MeetingType = "monday" | "thursday";
export type MeetingFieldKey =
  | "wins"
  | "priorities"
  | "blockers"
  | "decisions"
  | "fyis";

// Shared by the submission form (app/meeting-prep) and the Reports "Team
// Meeting" review tab - one source of truth for labels, prompts, and icons.
export const MEETING_PREP_CATEGORIES: {
  key: MeetingFieldKey;
  Icon: IconType;
  title: string;
  prompt: string;
  optional?: boolean;
}[] = [
  {
    key: "wins",
    Icon: FiCheckCircle,
    title: "Wins",
    prompt: "What did you complete or accomplish since the last meeting?",
  },
  {
    key: "priorities",
    Icon: FiTarget,
    title: "Top Priorities",
    prompt: "What are your top priorities until the next meeting?",
  },
  {
    key: "blockers",
    Icon: FiAlertTriangle,
    title: "Blockers / Help Needed",
    prompt: "Anything preventing progress? Who or what are you waiting on?",
  },
  {
    key: "decisions",
    Icon: FiUsers,
    title: "Decisions Needed",
    prompt: "Anything requiring leadership discussion or approval?",
  },
  {
    key: "fyis",
    Icon: FiAlertCircle,
    title: "FYIs / Risks",
    prompt: "Anything important the leadership team should know?",
    optional: true,
  },
];

const REPORT_TZ = "America/Los_Angeles";
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateStrInTZ(date: Date, tz: string = REPORT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function ptDayOfWeek(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ,
    weekday: "short",
  }).format(d);
  return WEEKDAY_SHORT.indexOf(name);
}

function ptDateParts(d: Date): { y: number; mo: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), mo: get("month") - 1, day: get("day") };
}

function noonUTC(y: number, mo: number, day: number): Date {
  return new Date(Date.UTC(y, mo, day, 12));
}

function addDays(d: Date, n: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n, 12),
  );
}

/** Meeting type for a PT calendar date that is known to be a Monday or Thursday. */
export function meetingTypeOf(date: Date): MeetingType {
  return ptDayOfWeek(date) === 1 ? "monday" : "thursday";
}

/**
 * The next meeting date (Monday or Thursday, PT calendar) on/after `from`.
 * If `from` itself is a meeting day, that day is returned.
 */
export function nextMeetingDate(from: Date = new Date()): Date {
  const { y, mo, day } = ptDateParts(from);
  let d = noonUTC(y, mo, day);
  for (let i = 0; i < 7; i++) {
    const dow = ptDayOfWeek(d);
    if (dow === 1 || dow === 4) return d;
    d = addDays(d, 1);
  }
  return d; // unreachable - every 7-day span contains a Mon and a Thu
}

/** Step to the adjacent meeting instance, alternating Mon ↔ Thu. `dir` = -1 (older) or 1 (newer). */
export function adjacentMeetingDate(meetingDate: Date, dir: 1 | -1): Date {
  const type = meetingTypeOf(meetingDate);
  const delta =
    type === "monday"
      ? dir === 1
        ? 3
        : -4 // Mon → next Thu (+3) or prior Thu (-4)
      : dir === 1
        ? 4
        : -3; // Thu → next Mon (+4) or same-week Mon (-3)
  return addDays(meetingDate, delta);
}

/** Deadline calendar day for a meeting: the Friday before a Monday, the Wednesday before a Thursday. */
export function meetingDeadlineDate(meetingDate: Date): Date {
  return addDays(
    meetingDate,
    meetingTypeOf(meetingDate) === "monday" ? -3 : -1,
  );
}

/** True once the deadline day has fully elapsed in PT. */
export function meetingDeadlinePassed(
  meetingDate: Date,
  now: Date = new Date(),
): boolean {
  return dateStrInTZ(now) > dateStrInTZ(meetingDeadlineDate(meetingDate));
}

/** "Monday, Jul 6" style label for the meeting itself. */
export function fmtMeetingDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** "Fri, Jul 3" style label for the submission deadline. */
export function fmtDeadline(meetingDate: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(meetingDeadlineDate(meetingDate));
}

/** YYYY-MM-DD (PT calendar) for a meeting date - use as the `meeting_date` API param. */
export const meetingDateISO = ptDateISO;

/** Parse a YYYY-MM-DD meeting_date string back to a noon-UTC PT-anchored Date. */
export function parseMeetingDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}
