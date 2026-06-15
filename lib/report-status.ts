// Weekly-report submission timeliness, classified relative to the report's week.
//   on-time = submitted by end of Friday
//   weekend = submitted Saturday or Sunday of that same week
//   late    = submitted the following week or later
export type SubmitStatus = 'on-time' | 'weekend' | 'late'

export function classifySubmission(createdAt: string | Date, weekMonday: Date): SubmitStatus {
  const created = new Date(createdAt)
  const fri = new Date(weekMonday); fri.setDate(weekMonday.getDate() + 4); fri.setHours(23, 59, 59, 999)
  const sun = new Date(weekMonday); sun.setDate(weekMonday.getDate() + 6); sun.setHours(23, 59, 59, 999)
  if (created <= fri) return 'on-time'
  if (created <= sun) return 'weekend'
  return 'late'
}

// Presentation metadata for each status (design-token classes).
export const SUBMIT_STATUS_META: Record<SubmitStatus, {
  label: string        // short badge label
  long: string         // descriptive label
  badge: string        // badge-* class
  dot: string          // circle background/text classes
  text: string         // plain text-color class
  border: string       // border-color class
}> = {
  'on-time': { label: 'On time', long: 'Filed on time (by Friday)',       badge: 'badge-green', dot: 'bg-success-light text-success', text: 'text-success', border: 'border-success/40' },
  'weekend': { label: 'Weekend', long: 'Filed late (Sat/Sun)',            badge: 'badge-amber', dot: 'bg-warning-light text-warning', text: 'text-warning', border: 'border-warning/40' },
  'late':    { label: 'Late',    long: 'Filed very late (following week)', badge: 'badge-red',   dot: 'bg-danger-light text-danger',   text: 'text-danger',  border: 'border-danger/40' },
}
