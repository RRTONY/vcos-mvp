// Match a weekly_reports.submitted_by value to a team member's full name.
// Exact match first, then a first-name fuzzy fallback so "Kim" matches
// "Kimberly", "Chase" matches "Chase", etc. Used by BOTH the dashboard and the
// compliance scorecard so their "filed / missing" status can never disagree.
export function isReportFrom(submittedBy: string | null | undefined, fullName: string): boolean {
  if (!submittedBy || !fullName) return false
  if (submittedBy === fullName) return true
  const sb = submittedBy.toLowerCase()
  const first = fullName.split(' ')[0].toLowerCase()
  return sb.includes(first) || first.includes(sb.split(' ')[0])
}

// Did this member file in the given list of reports?
export function memberFiled(reports: { submitted_by: string }[], fullName: string): boolean {
  return reports.some(r => isReportFrom(r.submitted_by, fullName))
}
