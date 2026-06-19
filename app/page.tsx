'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRefresh } from '@/components/RefreshContext'
import { ShareSlackButton } from '@/components/ShareButtons'
import type { Task, ClickUpData, SlackData, WebWorkMember } from '@/lib/types'
import StaleBadge from '@/components/StaleBadge'
import { useMe } from '@/hooks/useMe'
import { CLICKUP_WORKSPACE_URL, SLACK_WORKSPACE_URL, SLACK_CHANNEL_WEEKLY_REPORTS, OVERDUE_ALERT_THRESHOLD } from '@/lib/constants'
import { FiCheck, FiX } from 'react-icons/fi'
import Spinner from '@/components/Spinner'
import { classifySubmission, SUBMIT_STATUS_META } from '@/lib/report-status'
import { isReportFrom } from '@/lib/report-match'
import TaskBuckets from '@/components/TaskBuckets'
import Avatar from '@/components/Avatar'

interface TeamMember { name: string; cuKey: string; role: string; filesReport: boolean }
interface OKR { id: string; label: string; pct: number; note: string }
interface WeeklyReportEntry { id: string; submitted_by: string; created_at: string }

function getMostRecentMonday(from: Date): Date {
  const d = new Date(from)
  const jsDay = d.getDay()
  const daysSinceMonday = (jsDay + 6) % 7
  d.setDate(d.getDate() - daysSinceMonday)
  d.setHours(0, 0, 0, 0)
  return d
}

function fmtWeekLabel(mon: Date): string {
  const fri = new Date(mon)
  fri.setDate(mon.getDate() + 4)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(mon)}–${fmt(fri)}`
}
import dynamic from 'next/dynamic'
const CrmDonut = dynamic(() => import('@/components/charts/CrmDonut'), { ssr: false })
const OkrRings = dynamic(() => import('@/components/charts/OkrRing'), { ssr: false })
const MemberSparkline = dynamic(() => import('@/components/charts/MemberSparkline'), { ssr: false })


function findStats(
  assigneeStats: Record<string, { total: number; overdue: number; urgent: number }> | undefined,
  cuKey: string
) {
  if (!assigneeStats) return null
  const key = Object.keys(assigneeStats).find((k) => k.includes(cuKey))
  return key ? assigneeStats[key] : null
}

function findAvatar(
  avatars: Record<string, { image: string | null; initials: string | null; color: string | null }> | undefined,
  cuKey: string
) {
  if (!avatars) return null
  const key = Object.keys(avatars).find((k) => k.includes(cuKey))
  return key ? avatars[key] : null
}

function findTasks(tasksByAssignee: Record<string, Task[]> | undefined, cuKey: string): Task[] {
  if (!tasksByAssignee) return []
  const key = Object.keys(tasksByAssignee).find((k) => k.includes(cuKey))
  return key ? tasksByAssignee[key] : []
}

function MemberCard({
  member, stats, tasks, filed, loading, sparkline, reportStatus, avatar,
}: {
  member: TeamMember
  stats: { total: number; overdue: number; urgent: number } | null
  tasks: Task[]
  filed: boolean
  loading: boolean
  sparkline?: { date: string; hours: number }[]
  reportStatus?: 'on-time' | 'late' | null
  avatar?: { image: string | null; initials: string | null; color: string | null } | null
}) {
  const [open, setOpen] = useState(false)
  const flow = stats && stats.total > 0
    ? Math.max(5, Math.round(100 - (stats.overdue / stats.total) * 100))
    : null
  const effectiveFiled = reportStatus !== undefined ? reportStatus !== null : filed
  const hasIssues = (stats?.overdue ?? 0) > 0 || (stats?.urgent ?? 0) > 0 || !effectiveFiled

  const flowColor = flow === null ? '' : flow >= 80 ? 'bg-success' : flow >= 50 ? 'bg-warning' : 'bg-danger'

  return (
    <div className={`card mb-2 ${hasIssues ? 'border-danger/30' : ''}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 sm:px-5 py-3 sm:py-4 text-left hover:bg-sand2 transition-colors rounded-lg"
      >
        {/* Avatar — ClickUp profile photo, else two-letter initials */}
        <Avatar
          name={member.name}
          image={avatar?.image}
          initials={avatar?.initials}
          color={avatar?.color}
          className="w-9 h-9 sm:w-10 sm:h-10 text-sm sm:text-base"
        />

        {/* Middle — name, role, progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm sm:text-base font-semibold">{member.name}</span>
            <span className="hidden sm:inline text-sm text-ink4">{member.role}</span>
          </div>
          {loading ? (
            <div className="h-2 w-20 bg-sand3 rounded mt-1.5 animate-pulse" />
          ) : stats && flow !== null ? (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <div className="progress-track w-20 sm:w-24">
                <div className={`progress-fill ${flowColor}`} style={{ width: `${flow}%` }} />
              </div>
              <span className="text-xs sm:text-sm text-ink3">{flow}%</span>
              {/* Badges inline on mobile, shown here */}
              {stats.overdue > 0 && <span className="badge-red">{stats.overdue} overdue</span>}
              {stats.urgent > 0 && <span className="badge-amber">{stats.urgent} urgent</span>}
            </div>
          ) : (
            <span className="text-xs text-ink4 mt-1 block">No tasks</span>
          )}
        </div>

        {/* Right — sparkline + filed badge + count + chevron */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {sparkline && sparkline.length > 0 && (
            <span className="hidden sm:block">
              <MemberSparkline byDay={sparkline} color={flow !== null && flow < 50 ? '#DC2626' : '#4F46E5'} />
            </span>
          )}
          {member.filesReport && (
            reportStatus !== undefined
              ? reportStatus === 'on-time'
                ? <span className="badge-green">Filed ✓</span>
                : reportStatus === 'late'
                  ? <span className="badge-amber">Filed (late)</span>
                  : <span className="badge-red">Missing</span>
              : <span className={filed ? 'badge-green' : 'badge-red'}>
                  {filed ? 'Filed' : 'Missing'}
                </span>
          )}
          {stats && (
            <span className="hidden sm:inline text-sm text-ink4">{stats.total} tasks</span>
          )}
          <span className="text-ink4 text-xs ml-0.5">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-sand3 px-5 py-1">
          <TaskBuckets tasks={tasks} />
          {tasks.length > 0 && (
            <a
              href={`${CLICKUP_WORKSPACE_URL}/home`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-accent hover:underline py-3"
            >
              Open all in ClickUp ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [slack, setSlack] = useState<SlackData | null>(null)
  const [clickup, setClickUp] = useState<ClickUpData | null>(null)
  const [webwork, setWebwork] = useState<{ members: WebWorkMember[] } | null>(null)
  const [screenshots, setScreenshots] = useState<Record<string, { url: string; filename: string; capturedAt: string | null }[]> | null>(null)
  const [loading, setLoading] = useState(true)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [okrs, setOkrs] = useState<OKR[]>([])
  const [editingOkr, setEditingOkr] = useState<string | null>(null)
  const [okrDraft, setOkrDraft] = useState<{ pct: number; note: string }>({ pct: 0, note: '' })
  const [savingOkr, setSavingOkr] = useState(false)
  const { refreshKey, freshClickUp } = useRefresh()
  const prevKey = useRef(refreshKey)
  const { isOwner, isAdmin, me } = useMe()
  const [selectedMonday, setSelectedMonday] = useState<Date>(() => getMostRecentMonday(new Date()))
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReportEntry[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)

  useEffect(() => {
    fetch('/api/team', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: Array<{ full_name: string; clickup_key: string | null; role_description: string | null; files_report: boolean; active: boolean }>) => {
        setTeam((data ?? []).filter(m => m.active).map(m => ({
          name: m.full_name,
          cuKey: m.clickup_key ?? m.full_name.split(' ')[0].toLowerCase(),
          role: m.role_description ?? '',
          filesReport: m.files_report,
        })))
      }).catch(() => {})
    fetch('/api/okrs', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: OKR[]) => { if (Array.isArray(data)) setOkrs(data) })
      .catch(() => {})
  }, [])

  async function saveOkr(id: string) {
    setSavingOkr(true)
    const res = await fetch('/api/okrs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...okrDraft }),
    })
    if (res.ok) {
      const updated = await res.json()
      setOkrs(prev => prev.map(o => o.id === id ? { ...o, ...updated } : o))
      setEditingOkr(null)
    }
    setSavingOkr(false)
  }

  const load = useCallback(async (cancelled: { v: boolean }, cachedClickUp?: Record<string, unknown> | null) => {
    setLoading(true)
    const [s, c, w, sc] = await Promise.all([
      fetch('/api/slack-stats', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      cachedClickUp ? Promise.resolve(cachedClickUp) : fetch('/api/clickup-tasks', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/webwork', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/screenshots', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ])
    if (!cancelled.v) {
      setSlack(s)
      setClickUp(c)
      setWebwork(w)
      setScreenshots(sc?.screenshots ?? null)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const cancelled = { v: false }
    load(cancelled)
    return () => { cancelled.v = true }
  }, [load])

  useEffect(() => {
    if (refreshKey === prevKey.current) return
    prevKey.current = refreshKey
    const cancelled = { v: false }
    load(cancelled, freshClickUp)
    return () => { cancelled.v = true }
  }, [refreshKey, freshClickUp, load])

  useEffect(() => {
    setReportsLoading(true)
    const weekStart = selectedMonday.toISOString().slice(0, 10)
    fetch(`/api/weekly-reports?week_start=${weekStart}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((data: WeeklyReportEntry[]) => {
        setWeeklyReports(Array.isArray(data) ? data : [])
        setReportsLoading(false)
      })
      .catch(() => setReportsLoading(false))
  }, [selectedMonday])

  const wr = slack?.weeklyReports
  const filed = wr?.filed ?? []
  const missing = wr?.missing ?? []

  const currentMonday = getMostRecentMonday(new Date())
  const isCurrentWeek = selectedMonday.getTime() === currentMonday.getTime()
  const selectedFriday = new Date(selectedMonday)
  selectedFriday.setDate(selectedMonday.getDate() + 4)
  selectedFriday.setHours(23, 59, 59, 999)
  const selectedWeekLabel = fmtWeekLabel(selectedMonday)

  function getMemberReportEntry(memberName: string): WeeklyReportEntry | null {
    // Shared matcher (exact, then first-name fuzzy) — keeps the dashboard and the
    // compliance scorecard in agreement about who filed.
    return weeklyReports.find(r => isReportFrom(r.submitted_by, memberName)) ?? null
  }

  function getMemberReportStatus(memberName: string): 'on-time' | 'late' | null {
    const report = getMemberReportEntry(memberName)
    if (!report) return null
    return new Date(report.created_at) <= selectedFriday ? 'on-time' : 'late'
  }

  const reportingMembers = team.filter(m => m.filesReport)
  // Authoritative source = actual submissions in the weekly_reports table (the form
  // writes there). Earlier this used Slack-channel scanning, which failed to match
  // submissions and flagged everyone as missing.
  const missingMembers   = reportingMembers.filter(m => getMemberReportEntry(m.name) === null)
  const displayFiled   = reportingMembers.length - missingMembers.length
  const displayMissing = missingMembers.length
  const displayTotal   = reportingMembers.length

  // Non-admins see only their OWN ClickUp task numbers; admins see the whole team.
  const myCuKey = me?.fullName ? (team.find(m => m.name === me.fullName)?.cuKey ?? null) : null
  const scopedClickUp: ClickUpData | null = (() => {
    if (isAdmin || !clickup) return clickup
    const stats = clickup.assigneeStats
      ? Object.entries(clickup.assigneeStats).find(([k]) => myCuKey && k.includes(myCuKey))?.[1]
      : null
    const total = stats?.total ?? 0
    const overdue = stats?.overdue ?? 0
    const urgent = stats?.urgent ?? 0
    return {
      ...clickup,
      totalTasks: total,
      overdue,
      urgent,
      overduePercent: total > 0 ? Math.round((overdue / total) * 100) : 0,
      completed: 0,
    }
  })()

  // Items needing CEO attention
  const actions: { level: 'red' | 'amber' | 'blue'; text: React.ReactNode }[] = []
  if (!loading) {
    if (isCurrentWeek && !reportsLoading && missingMembers.length > 0) actions.push({
      level: 'red',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>Reports missing:</strong> {missingMembers.map(m => m.name).join(', ')} have not filed this week.</span>
          <a href={`${SLACK_WORKSPACE_URL}/${SLACK_CHANNEL_WEEKLY_REPORTS}`} target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">Slack channel ↗</a>
        </span>
      ),
    })
    if ((scopedClickUp?.urgent ?? 0) > 0) actions.push({
      level: 'red',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>{scopedClickUp?.urgent} urgent tasks</strong> {isAdmin ? 'across the team' : 'assigned to you'} need immediate resolution.</span>
          <a href={`${CLICKUP_WORKSPACE_URL}/home`} target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">ClickUp ↗</a>
        </span>
      ),
    })
    if ((scopedClickUp?.overduePercent ?? 0) > OVERDUE_ALERT_THRESHOLD) actions.push({
      level: 'red',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>{isAdmin ? 'CRM' : 'Your'} overdue at {scopedClickUp?.overduePercent}%</strong> — {scopedClickUp?.overdue} of {scopedClickUp?.totalTasks} tasks past due. Needs triage.</span>
          <a href={`${CLICKUP_WORKSPACE_URL}/home`} target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">ClickUp ↗</a>
        </span>
      ),
    })
  }

  const weeklyReportTemplate = [
    `#myweeklyreport`,
    ``,
    `1. What is blocked, stuck, or at risk right now?`,
    `   Format: Blocker → Impact if unresolved → What's needed → From whom`,
    ``,
    `2. Is anything broken, behind, or needs to be escalated?`,
    `   Format: Issue → Current status → Recommended action`,
    ``,
    `3. Top 3–5 priorities for next week (in order)`,
    `   Format: Priority → Definition of done → Owner if team`,
    ``,
    `4. Which of last week's priorities did you complete — and what didn't get done, and why?`,
    `   Format: Priority → Done / Not done → Reason if not done`,
    ``,
    `5. Most important accomplishment this week & business impact`,
    ``,
    `6. Full list of accomplishments by area`,
    `   Sales: / Client delivery: / Internal operations: / Other:`,
    ``,
    `7. What didn't go well — and what should change because of it?`,
    ``,
    `8. What went well that's worth repeating or recognizing?`,
    ``,
    `9. What you need from others to support you`,
    ``,
    `10. (Optional) Personal notes`,
  ].join('\n')

  const shareMsg = [
    `📊 *CEO Status Brief — Week of ${selectedWeekLabel}*`,
    `Reports: ${displayFiled}/${displayTotal} filed${displayMissing > 0 ? ` · Missing: ${isCurrentWeek ? missing.map(n => n.split(' ')[0]).join(', ') : `${displayMissing} members`}` : ' ✅'}`,
    clickup ? `CRM: ${clickup.overduePercent}% overdue (${clickup.overdue}/${clickup.totalTasks}) · ${clickup.urgent} urgent` : '',
    `_From Visual Chief of Staff_`,
    missing.length ? [
      ``,
      `📋 *${missing.map(n => n.split(' ')[0]).join(', ')}* — please post your weekly report using the template below. Include *#myweeklyreport* at the top.`,
      `\`\`\``,
      weeklyReportTemplate,
      `\`\`\``,
    ].join('\n') : '',
  ].filter(Boolean).join('\n')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mt-6 mb-4">
        <div>
          <h1 className="font-display text-2xl tracking-widest">CEO COMMAND</h1>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <button
              onClick={() => setSelectedMonday(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
              className="text-ink4 hover:text-ink text-lg w-7 h-7 flex items-center justify-center rounded hover:bg-sand3 transition-colors"
              title="Previous week"
            >‹</button>
            <span className="text-xs text-ink4 px-1">Week of {selectedWeekLabel}</span>
            <button
              onClick={() => setSelectedMonday(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
              disabled={isCurrentWeek}
              className="text-ink4 hover:text-ink text-lg w-7 h-7 flex items-center justify-center rounded hover:bg-sand3 transition-colors disabled:opacity-30"
              title="Next week"
            >›</button>
            {!isCurrentWeek && (
              <button
                onClick={() => setSelectedMonday(getMostRecentMonday(new Date()))}
                className="text-xs text-accent hover:underline ml-1"
              >Current week</button>
            )}
            <StaleBadge
              ageMinutes={(clickup as {_ageMinutes?: number})?._ageMinutes}
              circuitOpen={(clickup as {_circuitOpen?: boolean})?._circuitOpen}
            />
          </div>
        </div>
        {!loading && (
          <ShareSlackButton label="Post Brief" message={shareMsg} />
        )}
      </div>

      {/* Tony — chatbot entry */}
      <Link
        href="/chatbot"
        className="card mb-6 flex items-center gap-4 px-5 py-4 hover:border-accent hover:shadow-card-md transition-all group"
      >
        <div className="w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center font-display text-base flex-shrink-0">AI</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink group-hover:text-accent transition-colors">VCoS-AI — your Virtual Chief of Staff</div>
          <div className="text-xs text-ink4 mt-0.5">Ask anything, find info, and generate reports from live data — download as PDF or Word. Team-wide reports are admin-only.</div>
        </div>
        <span className="badge-accent flex-shrink-0">Open chat →</span>
      </Link>

      {/* Key metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Reports filed */}
        <div className={`stat-tile ${loading || reportsLoading ? 'animate-pulse' : ''}`}>
          <div className={`stat-value ${!loading && displayMissing > 0 ? 'text-danger' : 'text-success'}`}>
            {loading || reportsLoading ? '—' : `${displayFiled}/${displayTotal}`}
          </div>
          <div className="stat-label">Reports Filed</div>
          {!loading && !reportsLoading && (
            <div className="stat-sub">
              {(() => {
                const lateCount = reportingMembers.filter(m => getMemberReportStatus(m.name) === 'late').length
                if (displayMissing > 0) return `${displayMissing} missing${lateCount > 0 ? ` · ${lateCount} late` : ''}`
                if (lateCount > 0) return `All filed · ${lateCount} submitted late`
                if (displayFiled > 0) return 'All filed on time ✓'
                return isCurrentWeek && missing.length > 0 ? `Missing: ${missing.join(', ')}` : '—'
              })()}
            </div>
          )}
          {!loading && !reportsLoading && displayTotal > 0 && (
            <div className="progress-track mt-2">
              <div
                className={`progress-fill ${displayMissing > 0 ? 'bg-danger' : 'bg-success'}`}
                style={{ width: `${Math.round((displayFiled / displayTotal) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* CRM donut */}
        <div className={`stat-tile overflow-hidden ${loading ? 'animate-pulse' : ''}`}>
          <div className="stat-label mb-3">{isAdmin ? 'CRM Task Breakdown' : 'My Task Breakdown'}</div>
          {loading ? (
            <div className="h-24 flex items-center justify-center text-ink4 text-sm">Loading…</div>
          ) : scopedClickUp && scopedClickUp.totalTasks ? (
            <CrmDonut
              total={scopedClickUp.totalTasks}
              overdue={scopedClickUp.overdue ?? 0}
              urgent={scopedClickUp.urgent ?? 0}
              completed={scopedClickUp.completed ?? 0}
            />
          ) : (
            <div className="text-sm text-ink4">No task data</div>
          )}
        </div>

        {/* Urgent + overdue quick tiles */}
        <div className="flex flex-col gap-3">
          <div className={`stat-tile flex-1 ${loading ? 'animate-pulse' : ''}`}>
            <div className={`stat-value ${!loading && (scopedClickUp?.urgent ?? 0) > 0 ? 'text-danger' : 'text-ink'}`}>
              {loading ? '—' : (scopedClickUp?.urgent ?? '—')}
            </div>
            <div className="stat-label">Urgent Tasks</div>
            <div className="stat-sub">{isAdmin ? 'Need immediate action' : 'Assigned to you'}</div>
          </div>
          <div className={`stat-tile flex-1 ${loading ? 'animate-pulse' : ''}`}>
            <div className={`stat-value ${!loading && (scopedClickUp?.overduePercent ?? 0) > 50 ? 'text-danger' : 'text-warning'}`}>
              {loading ? '—' : `${scopedClickUp?.overduePercent ?? '—'}%`}
            </div>
            <div className="stat-label">{isAdmin ? 'CRM Overdue' : 'My Overdue'}</div>
            {!loading && scopedClickUp && <div className="stat-sub">{scopedClickUp.overdue} of {scopedClickUp.totalTasks} tasks</div>}
          </div>
        </div>
      </div>

      {/* Actions required */}
      <div className="slbl">Actions Required</div>
      {loading ? (
        <div className="alert alert-amber animate-pulse">Loading live data…</div>
      ) : (
        actions.map((a, i) => (
          <div key={i} className={`alert alert-${a.level}`}>{a.text}</div>
        ))
      )}

      {/* Team Assignment Board — admins see everyone; others see only their own row */}
      <div className="slbl mt-6">{isAdmin ? 'Team Assignment Board' : 'My Tasks'}</div>
      <p className="text-xs text-ink4 mb-3">
        {isAdmin
          ? 'Click any team member to see their assigned tasks from ClickUp.'
          : 'Your assigned tasks from ClickUp.'}
      </p>
      <div className="space-y-2 mb-6">
        {(isAdmin ? team : team.filter(m => me?.fullName && m.name === me.fullName)).map((member) => {
          const wwMember = webwork?.members?.find((m) => m.username === member.cuKey)
          return (
            <MemberCard
              key={member.name}
              member={member}
              stats={findStats(clickup?.assigneeStats, member.cuKey)}
              tasks={findTasks(clickup?.tasksByAssignee, member.cuKey)}
              filed={getMemberReportEntry(member.name) !== null}
              loading={loading}
              sparkline={wwMember?.byDay}
              reportStatus={member.filesReport ? getMemberReportStatus(member.name) : undefined}
              avatar={findAvatar(clickup?.assigneeAvatars, member.cuKey)}
            />
          )
        })}
      </div>

      {/* Team Screenshots */}
      {screenshots && Object.values(screenshots).some(arr => arr.length > 0) && (
        <div className="mb-6">
          <div className="slbl">Team Screenshots — Today</div>
          <div className="card divide-y divide-sand3">
            {team.filter(m => screenshots[m.cuKey]?.length > 0).map(member => {
              const shots = screenshots[member.cuKey] ?? []
              return (
                <div key={member.cuKey} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold">{member.name}</span>
                    <span className="text-xs text-ink4">{shots.length} screenshot{shots.length !== 1 ? 's' : ''}</span>
                    {shots[0]?.capturedAt && shots[shots.length - 1]?.capturedAt && (
                      <span className="text-xs text-ink4 hidden sm:inline">
                        · {shots[0].capturedAt} – {shots[shots.length - 1].capturedAt}
                      </span>
                    )}
                  </div>
                  {/* Thumbnail strip — scrollable on mobile */}
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {shots.map((shot, i) => (
                      <a
                        key={i}
                        href={shot.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 group relative"
                        title={shot.capturedAt ?? shot.filename}
                      >
                        <img
                          src={shot.url}
                          alt={shot.capturedAt ?? `Screenshot ${i + 1}`}
                          className="w-20 h-14 sm:w-24 sm:h-16 object-cover rounded border border-sand3 group-hover:border-accent transition-colors"
                          loading="lazy"
                        />
                        {shot.capturedAt && (
                          <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] bg-black/50 text-white rounded-b px-1 py-0.5">
                            {shot.capturedAt}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* OKR Pulse */}
      <div className="slbl">OKR Pulse</div>
      <div className="card mb-6 px-5">
        <OkrRings okrs={okrs} />
        {isOwner && okrs.length > 0 && (
          <div className="border-t border-sand3 pt-3 pb-2 space-y-2">
            {okrs.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-2 text-xs">
                {editingOkr === o.id ? (
                  <>
                    <span className="w-28 font-semibold text-ink shrink-0 truncate">{o.label}</span>
                    <input
                      type="number" min={0} max={100} step={1}
                      className="field-input w-16 text-right font-mono"
                      value={okrDraft.pct}
                      onChange={e => setOkrDraft(d => ({ ...d, pct: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
                    />
                    <span className="text-ink4">%</span>
                    <input
                      type="text"
                      className="field-input flex-1 min-w-0"
                      value={okrDraft.note}
                      onChange={e => setOkrDraft(d => ({ ...d, note: e.target.value }))}
                      placeholder="Note…"
                    />
                    <button
                      className="btn-primary text-xs py-0.5 px-2 disabled:opacity-50"
                      disabled={savingOkr}
                      onClick={() => saveOkr(o.id)}
                    >{savingOkr ? '…' : 'Save'}</button>
                    <button className="text-ink4 hover:text-ink px-1" onClick={() => setEditingOkr(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <span className="w-28 font-semibold text-ink shrink-0 truncate">{o.label}</span>
                    <span className="font-mono w-8 text-right">{o.pct}%</span>
                    <span className="text-ink4 flex-1 truncate">{o.note}</span>
                    <button
                      className="text-ink4 hover:text-ink px-1"
                      onClick={() => { setEditingOkr(o.id); setOkrDraft({ pct: o.pct, note: o.note ?? '' }) }}
                    >✏</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weekly report submissions — who sent / who hasn't (managers see everyone) */}
      {isAdmin && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <div className="slbl mb-0">Weekly Report Submissions — {selectedWeekLabel}</div>
            <span className="text-xs text-ink4">
              {reportsLoading ? 'Loading…' : `${reportingMembers.filter(m => getMemberReportEntry(m.name)).length} of ${reportingMembers.length} submitted`}
            </span>
          </div>
          <div className="card divide-y divide-sand3">
            {reportsLoading ? (
              <div className="px-5 py-3"><Spinner label="Loading submissions…" className="text-ink4 text-sm" /></div>
            ) : reportingMembers.length === 0 ? (
              <div className="px-4 py-3 text-sm text-ink4">No reporting members configured.</div>
            ) : (
              <>
                {/* Submitted — with date & time */}
                {reportingMembers.map(m => {
                  const rep = getMemberReportEntry(m.name)
                  if (!rep) return null
                  const meta = SUBMIT_STATUS_META[classifySubmission(rep.created_at, selectedMonday)]
                  const when = new Date(rep.created_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                  return (
                    <div key={m.name} className="flex items-center gap-3 px-5 py-3">
                      <span className={`w-6 h-6 rounded-full ${meta.dot} flex items-center justify-center flex-shrink-0`}><FiCheck className="w-3.5 h-3.5" /></span>
                      <span className="text-sm font-semibold flex-1 min-w-0 truncate">{m.name}</span>
                      <span className={meta.badge} title={meta.long}>{meta.label}</span>
                      <span className="text-xs text-ink4 whitespace-nowrap">{when}</span>
                    </div>
                  )
                })}
                {/* Not submitted */}
                {reportingMembers.filter(m => !getMemberReportEntry(m.name)).map(m => (
                  <div key={m.name} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-6 h-6 rounded-full bg-danger-light text-danger flex items-center justify-center flex-shrink-0"><FiX className="w-3.5 h-3.5" /></span>
                    <span className="text-sm font-semibold flex-1 min-w-0 truncate text-ink3">{m.name}</span>
                    <span className="badge-red">Not submitted</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
