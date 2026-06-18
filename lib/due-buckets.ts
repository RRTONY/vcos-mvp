// Shared due-date bucketing used by Open Loops and the dashboard Team Assignment Board.
export type DueBucket = 'overdue' | 'today' | 'week'

/** Classify a raw due timestamp (ms) into overdue / today / this-week, or null
 *  if it has no due date or is due later than this week. */
export function bucketFor(dueTs: number | null | undefined, now: Date = new Date()): DueBucket | null {
  if (!dueTs) return null
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0)
  const endToday = new Date(now); endToday.setHours(23, 59, 59, 999)
  const endOfWeek = new Date(startToday)
  endOfWeek.setDate(startToday.getDate() + ((7 - now.getDay()) % 7)) // upcoming Sunday
  endOfWeek.setHours(23, 59, 59, 999)
  if (dueTs < startToday.getTime()) return 'overdue'
  if (dueTs <= endToday.getTime()) return 'today'
  if (dueTs <= endOfWeek.getTime()) return 'week'
  return null
}

export const DUE_BUCKET_META: Record<DueBucket, { label: string; text: string; dot: string }> = {
  overdue: { label: 'Overdue',       text: 'text-red-600',   dot: 'bg-red-600' },
  today:   { label: 'Due Today',     text: 'text-amber-600', dot: 'bg-amber-500' },
  week:    { label: 'Due This Week',  text: 'text-blue-700',  dot: 'bg-blue-500' },
}
