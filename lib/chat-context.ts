// Gathers a compact, current snapshot of VCOS operational state to ground the
// chatbot's answers. Role-scoped: admins/owners see the whole team; a normal user
// only sees their own tasks, hours, and report status.
import { getSupabase } from './supabase'
import { getTeamMembers, getTeamMemberByUsername, type TeamMemberRow } from './team-db'
import { getCachedSWR } from './api-cache'
import { isReportFrom } from './report-match'
import { bucketFor } from './due-buckets'
import { loadGoals, loadCommitments } from './memory'
import type { ClickUpData, Task, Meeting } from './types'

function mostRecentMonday(from: Date): Date {
  const d = new Date(from); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
function cuKeyOf(m: TeamMemberRow): string {
  return (m.clickup_key ?? m.full_name.split(' ')[0]).toLowerCase()
}
function lookup<T>(map: Record<string, T> | undefined, key: string): T | null {
  if (!map || !key) return null
  const k = Object.keys(map).find(x => x.includes(key))
  return k ? map[k] : null
}
function loopLine(t: Task): string {
  const tag = t.priority === 'urgent' ? '[URGENT] ' : t.priority === 'high' ? '[HIGH] ' : ''
  return `    - ${tag}${t.name}${t.dueDate ? ` (due ${t.dueDate})` : ' (no due date)'} — ${t.list}`
}

interface ReportRow { submitted_by: string; created_at: string; win?: string | null; accomplishments?: string | null; priorities?: string | null; blockers?: string | null; support_needed?: string | null }

export async function buildChatContext(username: string, isAdmin: boolean): Promise<string> {
  const now = new Date()
  const mon = mostRecentMonday(now)
  const weekLabel = (() => {
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4)
    const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${f(mon)}–${f(fri)}`
  })()

  const sb = getSupabase()
  const [members, cu, reportsRes, me, goals, commitments, ff] = await Promise.all([
    getTeamMembers().catch(() => [] as TeamMemberRow[]),
    getCachedSWR<ClickUpData>('clickup').then(r => r.data).catch(() => null),
    (async (): Promise<ReportRow[] | null> => {
      try {
        const { data } = await sb.from('weekly_reports')
          .select('submitted_by, created_at, win, accomplishments, priorities, blockers, support_needed')
          .gte('created_at', mon.toISOString())
          .order('created_at', { ascending: true })
        return (data as ReportRow[] | null) ?? null
      } catch { return null }
    })(),
    isAdmin ? Promise.resolve(null) : getTeamMemberByUsername(username).catch(() => null),
    loadGoals().catch(() => ''),
    loadCommitments().catch(() => []),
    getCachedSWR<{ meetings: Meeting[] }>('fireflies').then(r => r.data?.meetings ?? []).catch(() => [] as Meeting[]),
  ])

  const reports = reportsRes ?? []
  // Scope the roster: admins see everyone; a user sees only themselves.
  const scoped = isAdmin
    ? members
    : members.filter(m => (me && m.full_name === me.full_name) || (m.vcos_username ?? '').toLowerCase() === username.toLowerCase())

  const meName = (me?.full_name)
    ?? members.find(m => (m.vcos_username ?? '').toLowerCase() === username.toLowerCase())?.full_name
    ?? username

  const lines: string[] = []
  lines.push(`Today: ${fmtDate(now)}`)
  lines.push(`Current work week: ${weekLabel} (Monday ${mon.toISOString().slice(0, 10)})`)
  lines.push(`Current user: ${meName} (login: ${username}) — address them by their first name.`)
  lines.push(`Viewer role: ${isAdmin ? 'admin/owner (sees the whole team)' : 'team member (sees only their own data)'}`)
  lines.push('')

  // ── Goals — the source of truth every recommendation filters through ──
  if (goals && goals.trim()) {
    lines.push('## GOALS (source of truth — rank and filter every recommendation against these)')
    lines.push(goals.trim())
    lines.push('')
  }

  // ── Open & overdue commitments / decisions ──
  const openCommit = commitments.filter(c => c.status === 'open')
  if (openCommit.length) {
    const today = now.toISOString().slice(0, 10)
    const overdue = openCommit.filter(c => c.due && c.due < today)
    lines.push(`## COMMITMENTS & DECISIONS LOG (${openCommit.length} open${overdue.length ? `, ${overdue.length} OVERDUE` : ''}) — proactively surface overdue items`)
    for (const c of openCommit.slice(0, 30)) {
      const od = c.due && c.due < today ? ' ⚠️OVERDUE' : ''
      lines.push(`  - [${c.type}] ${c.text}${c.owner ? ` (owner: ${c.owner})` : ''}${c.due ? ` (due ${c.due})` : ''}${od}`)
    }
    lines.push('')
  }

  // ── Overall ClickUp health (admins only) ──
  if (isAdmin && cu) {
    lines.push('## ClickUp — overall')
    lines.push(`- Open tasks: ${cu.totalTasks ?? 0}, Overdue: ${cu.overdue ?? 0} (${cu.overduePercent ?? 0}%), Urgent: ${cu.urgent ?? 0}`)
    lines.push('')
  }

  // ── Weekly report compliance (admins only) ──
  if (isAdmin) {
    const reporting = members.filter(m => m.files_report)
    const filed = reporting.filter(m => reports.some(r => isReportFrom(r.submitted_by, m.full_name)))
    const missing = reporting.filter(m => !filed.includes(m))
    lines.push(`## Weekly reports — week of ${weekLabel}`)
    lines.push(`- Filed (${filed.length}/${reporting.length}): ${filed.map(m => m.full_name).join(', ') || 'none yet'}`)
    lines.push(`- MISSING (${missing.length}): ${missing.map(m => m.full_name).join(', ') || 'none — everyone filed'}`)
    lines.push('')
  }

  // ── Per-person detail ──
  lines.push(isAdmin ? '## Team — per person' : '## Your status')
  for (const m of scoped) {
    const key = cuKeyOf(m)
    const stats = lookup(cu?.assigneeStats, key)
    const tasks = (lookup(cu?.tasksByAssignee, key) ?? []) as Task[]
    const overdue = tasks.filter(t => bucketFor(t.dueTs, now) === 'overdue')
    const report = reports.find(r => isReportFrom(r.submitted_by, m.full_name)) ?? null

    lines.push(`### ${m.full_name}${m.role_description ? ` — ${m.role_description}` : ''}`)
    lines.push(`  - Tasks: ${stats?.total ?? tasks.length} open · ${stats?.overdue ?? overdue.length} overdue · ${stats?.urgent ?? 0} urgent`)
    lines.push(`  - Weekly report (this week): ${report ? 'FILED' : (m.files_report ? 'NOT FILED' : 'exempt')}`)
    if (report) {
      if (report.win) lines.push(`    · Win: ${report.win}`)
      if (report.priorities) lines.push(`    · Priorities: ${report.priorities}`)
      if (report.blockers) lines.push(`    · Blockers: ${report.blockers}`)
    }
    const topLoops = [...tasks]
      .sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1) || (a.dueTs ?? Infinity) - (b.dueTs ?? Infinity))
      .slice(0, 12)
    if (topLoops.length) {
      lines.push(`  - Open loops (top ${topLoops.length}${tasks.length > 12 ? ` of ${tasks.length}` : ''}):`)
      topLoops.forEach(t => lines.push(loopLine(t)))
    }
    lines.push('')
  }

  if (!scoped.length) {
    lines.push('(No matching team record found for this user — answer generally and note the account is not linked to a team profile.)')
  }

  // ── Recent meetings (Fireflies) — powers /prep ──
  let meetings = ff
  if (!isAdmin && me) {
    const nm = me.full_name.toLowerCase()
    const em = (me.email ?? '').toLowerCase()
    meetings = ff.filter(mt =>
      mt.teamParticipants?.some(p => p.toLowerCase().includes(nm) || nm.includes(p.toLowerCase())) ||
      (em && mt.matchedEmails?.some(e => e.toLowerCase() === em)))
  }
  if (meetings.length) {
    lines.push(`## RECENT MEETINGS (Fireflies) — use for /prep and context`)
    for (const mt of meetings.slice(0, 8)) {
      lines.push(`### ${mt.title} — ${mt.date}${mt.duration ? ` (${mt.duration})` : ''}`)
      if (mt.participants?.length) lines.push(`  - Participants: ${mt.participants.slice(0, 10).join(', ')}`)
      if (mt.overview) lines.push(`  - Overview: ${mt.overview.replace(/\s+/g, ' ').slice(0, 600)}`)
      if (mt.actionItems) lines.push(`  - Action items: ${mt.actionItems.replace(/\s+/g, ' ').slice(0, 600)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
