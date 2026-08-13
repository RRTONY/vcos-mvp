// Single source of truth for all week-boundary calculations.
//
// WHY: Every other approach (setHours(0,0,0,0), getDay() in local time) uses the
// browser/server's local timezone. When running in IST (UTC+5:30), local midnight
// on Monday is 18:30 Sunday UTC → formatting that midnight in PT shows Sunday, not
// Monday. This file always works in PT calendar dates to avoid that shift.

const REPORT_TZ = "America/Los_Angeles";
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Day-of-week (0=Sun … 6=Sat) for a given instant, evaluated in PT.
function ptDayOfWeek(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ,
    weekday: "short",
  }).format(d);
  return WEEKDAY_SHORT.indexOf(name);
}

// Calendar year/month(0-based)/day for a given instant, evaluated in PT.
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

/**
 * Returns the Monday of the week containing `from`, anchored to the PT calendar.
 * The result is always noon UTC (12:00Z) on that PT-calendar Monday so that:
 *   - toLocaleDateString(..., { timeZone: 'America/Los_Angeles' }) shows the right date
 *   - UTC date arithmetic (getUTCDate +/- days) stays on correct calendar days
 */
export function getMondayOfWeekPT(from: Date = new Date()): Date {
  const { y, mo, day } = ptDateParts(from);
  const dow = ptDayOfWeek(from); // 0=Sun … 6=Sat
  const daysSinceMon = (dow + 6) % 7; // Mon=0, Tue=1, … Sun=6
  return new Date(Date.UTC(y, mo, day - daysSinceMon, 12));
}

/**
 * Shift a Monday Date (noon UTC) by `n` weeks. Uses UTC arithmetic so DST never
 * moves the calendar day.
 */
export function shiftWeeks(monday: Date, n: number): Date {
  return new Date(
    Date.UTC(
      monday.getUTCFullYear(),
      monday.getUTCMonth(),
      monday.getUTCDate() + n * 7,
      12,
    ),
  );
}

/**
 * Format a Monday as "Mon dd–Mon dd" week range in PT.
 * e.g. getMondayOfWeekPT() on any day of Jun 29–Jul 3 week → "Jun 29–Jul 3"
 */
export function fmtWeekRange(monday: Date): string {
  const friday = new Date(
    Date.UTC(
      monday.getUTCFullYear(),
      monday.getUTCMonth(),
      monday.getUTCDate() + 4,
      12,
    ),
  );
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      timeZone: REPORT_TZ,
      month: "short",
      day: "numeric",
    });
  return `${fmt(monday)}–${fmt(friday)}`;
}

/**
 * ISO date string (YYYY-MM-DD) of a Monday Date, in PT calendar.
 * Use this as the `week_start` API parameter.
 */
export function weekStartISO(monday: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(monday);
}

/**
 * YYYY-MM-DD calendar date in PT for any instant - use this instead of
 * toISOString().slice(0,10), which returns the UTC day and can be off by one
 * relative to PT for several hours of every day.
 */
export const ptDateISO = weekStartISO;

/** Today's calendar date in PT, as YYYY-MM-DD. */
export function todayPT(): string {
  return ptDateISO(new Date());
}

/**
 * Parse a YYYY-MM-DD week_start string back to a noon-UTC Monday Date.
 * Appends T12:00:00Z so PT formatting always shows the correct calendar day.
 */
export function parseWeekStart(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/**
 * Returns both the correct week label AND the IST-shifted variant (1 day earlier).
 *
 * WHY: Before week-utils.ts existed, the submit form used an old getWeekOptions()
 * with setHours(0,0,0,0) - local midnight in IST (UTC+5:30) is 18:30 UTC the
 * previous day, which formats as the PREVIOUS PT calendar day. So IST users stored
 * week_label = "Jun 21–Jun 25" for the actual PT week "Jun 22–Jun 26".
 * Querying with .in([correct, shifted]) recovers those legacy reports.
 */
export function weekLabelVariants(monday: Date): [string, string] {
  const label = fmtWeekRange(monday);
  const prevDay = new Date(
    Date.UTC(
      monday.getUTCFullYear(),
      monday.getUTCMonth(),
      monday.getUTCDate() - 1,
      12,
    ),
  );
  return [label, fmtWeekRange(prevDay)];
}
