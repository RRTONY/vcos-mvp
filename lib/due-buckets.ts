// Shared due-date bucketing used by Open Loops, the Team tab, profiles, the
// weekly report and the dashboard. Matches the dashboard's counting rule:
//   overdue = due date earlier than now (no due date = never overdue).
// "Today" / "this week" and the day counts use Pacific Time calendar dates -
// ClickUp due dates are stored around 2:30 PM PT, so a viewer's local timezone
// (e.g. IST) must not shift them to another day.
export type DueBucket = 'overdue' | 'today' | 'week'

const TZ = 'America/Los_Angeles'
const DAY_MS = 24 * 60 * 60 * 1000

/** YYYY-MM-DD calendar date in Pacific Time. */
function ptDay(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
}

/** Whole calendar days from PT date `a` to PT date `b` (b - a). */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS)
}

/** Classify a raw due timestamp (ms) into overdue / today / this-week, or null
 *  if it has no due date or is due later than this week (ending Sunday, PT). */
export function bucketFor(dueTs: number | null | undefined, now: Date = new Date()): DueBucket | null {
  if (!dueTs) return null
  if (dueTs < now.getTime()) return 'overdue'
  const today = ptDay(now.getTime())
  const due = ptDay(dueTs)
  if (due === today) return 'today'
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay() // 0=Sun … 6=Sat
  const daysToSunday = (7 - dow) % 7
  if (dayDiff(today, due) <= daysToSunday) return 'week'
  return null
}

/** Pacific Time calendar days a due date is past: 3 = due 3 days ago,
 *  0 = due today, -1 = due tomorrow. Null when there is no due date. */
export function daysOverdue(dueTs: number | null | undefined, now: Date = new Date()): number | null {
  return dueTs ? dayDiff(ptDay(dueTs), ptDay(now.getTime())) : null
}

/** "3 days overdue", "1 day overdue", "Due today", "Due tomorrow" or
 *  "Due Nov 30" - counted in Pacific Time calendar days. Empty if no due date. */
export function dueLabel(dueTs: number | null | undefined, now: Date = new Date()): string {
  if (!dueTs) return ''
  const days = dayDiff(ptDay(dueTs), ptDay(now.getTime()))
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} overdue`
  if (days === 0) return 'Due today'
  if (days === -1) return 'Due tomorrow'
  return `Due ${new Date(dueTs).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}`
}

export const DUE_BUCKET_META: Record<DueBucket, { label: string; text: string; dot: string }> = {
  overdue: { label: 'Overdue',       text: 'text-red-600',   dot: 'bg-red-600' },
  today:   { label: 'Due Today',     text: 'text-amber-600', dot: 'bg-amber-500' },
  week:    { label: 'Due This Week',  text: 'text-blue-700',  dot: 'bg-blue-500' },
}
