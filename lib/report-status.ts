// Weekly-report submission timeliness, classified relative to the report's week.
//   on-time = submitted by end of Friday (Pacific Time)
//   weekend = submitted Saturday or Sunday of that same week (Pacific Time)
//   late    = submitted the following week or later
export type SubmitStatus = "on-time" | "weekend" | "late";

// Deadlines are always evaluated in Pacific Time regardless of where the
// browser or server is running - Friday ends at midnight PT, not IST.
const REPORT_TZ = "America/Los_Angeles";

function dateStrInTZ(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Returns a UTC noon Date for weekMonday + dayOffset calendar days.
// UTC noon (12:00Z) is always the same calendar day in PT (PT is UTC-7/8,
// so noon UTC = 04/05 AM PT - safely within the same date in PT).
function weekDayNoonUTC(weekMonday: Date, dayOffset: number): Date {
  return new Date(
    Date.UTC(
      weekMonday.getFullYear(),
      weekMonday.getMonth(),
      weekMonday.getDate() + dayOffset,
      12,
    ),
  );
}

export function classifySubmission(
  createdAt: string | Date,
  weekMonday: Date,
): SubmitStatus {
  const submittedPT = dateStrInTZ(new Date(createdAt), REPORT_TZ);
  const friPT = dateStrInTZ(weekDayNoonUTC(weekMonday, 4), REPORT_TZ);
  const sunPT = dateStrInTZ(weekDayNoonUTC(weekMonday, 6), REPORT_TZ);
  if (submittedPT <= friPT) return "on-time";
  if (submittedPT <= sunPT) return "weekend";
  return "late";
}

// The report for a week is DUE end of Friday Pacific Time.
// Returns Saturday 07:00 UTC which equals Fri 23:00 PST / Sat 00:00 PDT -
// i.e., just past the PT end-of-Friday in both winter and summer.
export function reportDueDate(weekMonday: Date): Date {
  return new Date(
    Date.UTC(
      weekMonday.getFullYear(),
      weekMonday.getMonth(),
      weekMonday.getDate() + 5,
      7,
    ),
  );
}
export function reportDeadlinePassed(
  weekMonday: Date,
  now: Date = new Date(),
): boolean {
  const nowPT = dateStrInTZ(now, REPORT_TZ);
  const friPT = dateStrInTZ(weekDayNoonUTC(weekMonday, 4), REPORT_TZ);
  return nowPT > friPT;
}

// Full state of a member's report for a given week:
//   filed → on-time | weekend | late  (how timely it was)
//   not filed, before/through Friday → 'pending' (do NOT flag as missing)
//   not filed, after Friday          → 'missing' (now overdue / "Not Submitted")
export type ReportState = SubmitStatus | "pending" | "missing";

export function reportState(
  weekMonday: Date,
  createdAt: string | Date | null | undefined,
  now: Date = new Date(),
): ReportState {
  if (createdAt) return classifySubmission(createdAt, weekMonday);
  return reportDeadlinePassed(weekMonday, now) ? "missing" : "pending";
}

// Presentation metadata for each status (design-token classes).
export const SUBMIT_STATUS_META: Record<
  SubmitStatus,
  {
    label: string; // short badge label
    long: string; // descriptive label
    badge: string; // badge-* class
    dot: string; // circle background/text classes
    text: string; // plain text-color class
    border: string; // border-color class
  }
> = {
  "on-time": {
    label: "On time",
    long: "Filed on time (by Friday)",
    badge: "badge-green",
    dot: "bg-success-light text-success",
    text: "text-success",
    border: "border-success/40",
  },
  weekend: {
    label: "Weekend",
    long: "Filed late (Sat/Sun)",
    badge: "badge-amber",
    dot: "bg-warning-light text-warning",
    text: "text-warning",
    border: "border-warning/40",
  },
  late: {
    label: "Late",
    long: "Filed very late (following week)",
    badge: "badge-red",
    dot: "bg-danger-light text-danger",
    text: "text-danger",
    border: "border-danger/40",
  },
};
