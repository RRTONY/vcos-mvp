'use client'

import { useEffect, useState, useRef } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import { ShareSlackButton } from '@/components/ShareButtons'
import type { Task, ClickUpData, SlackData, WebWorkMember, Meeting } from '@/lib/types'
interface TeamMember { name: string; cuKey: string; role: string; filesReport: boolean }
interface OKR { id: string; label: string; pct: number; note: string }
import { useMe } from '@/hooks/useMe'
import { CLICKUP_WORKSPACE_URL } from '@/lib/constants'
import StaleBadge from '@/components/StaleBadge'
import TabBar from '@/components/TabBar'
import MeetingTimeline from '@/components/MeetingTimeline'
import WeekCalendar from '@/components/WeekCalendar'
import DayCalendar from '@/components/DayCalendar'
import { FiCheck, FiAlertTriangle, FiCheckCircle, FiClock, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import Spinner from '@/components/Spinner'
import { classifySubmission, SUBMIT_STATUS_META, reportDeadlinePassed, type SubmitStatus } from '@/lib/report-status'
import { isReportFrom } from '@/lib/report-match'
import type { MeetingPrepRow } from '@/lib/types'
import {
  nextMeetingDate, adjacentMeetingDate, meetingDeadlinePassed,
  fmtMeetingDate, fmtDeadline, meetingDateISO, meetingTypeOf, MEETING_PREP_CATEGORIES,
} from '@/lib/meeting-prep'
import dynamic from 'next/dynamic'
const HoursBar = dynamic(() => import('@/components/charts/HoursBar'), { ssr: false })
const OkrRings = dynamic(() => import('@/components/charts/OkrRing'), { ssr: false })
const TrendCards = dynamic(() => import('@/components/charts/TrendCards'), { ssr: false })
const DayStackedBar = dynamic(() => import('@/components/charts/DayStackedBar'), { ssr: false })
const SlackHeatMap = dynamic(() => import('@/components/charts/SlackHeatMap'), { ssr: false })

// ─── Types ──────────────────────────────────────────────────────────────────

interface DailyReport {
  report_date: string
  reports_filed: string[]
  reports_missing: string[]
  overdue_count: number
  urgent_count: number
  total_tasks: number
  team_hours: Record<string, number>
  slack_message_ts: string | null
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="slbl">{title}</div>
      {children}
    </div>
  )
}

function MemberRollup({ name, stats, tasks, didFile, flow, loading, deadlinePassed = true }: {
  name: string
  stats: { total: number; overdue: number; urgent: number } | null
  tasks: Task[]; didFile: boolean; flow: number | null; loading: boolean; deadlinePassed?: boolean
}) {
  const [open, setOpen] = useState(false)
  // Before Friday, an unfiled report is "pending" (not an issue / not "missing").
  const reportPending = !didFile && !deadlinePassed
  const hasIssues = (stats?.overdue ?? 0) > 0 || (stats?.urgent ?? 0) > 0 || (!didFile && deadlinePassed)
  return (
    <div className={`border ${hasIssues ? 'border-ink/30' : 'border-sand3'}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sand3/40 transition-colors"
      >
        <div className={`w-7 h-7 flex items-center justify-center text-xs font-bold flex-shrink-0 ${hasIssues ? 'bg-black text-white' : 'bg-sand2 text-ink'}`}>
          {name[0]}
        </div>
        <span className="text-sm font-bold flex-1">{name}</span>
        {loading ? (
          <span className="text-xs text-ink4 animate-pulse">Loading…</span>
        ) : stats ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-ink3">{stats.total} tasks</span>
            {stats.overdue > 0 && <span className="font-bold text-red-600">{stats.overdue} overdue</span>}
            {stats.urgent > 0 && <span className="font-bold text-amber-600">{stats.urgent} urgent</span>}
            {flow !== null && (
              <div className="flex items-center gap-1.5">
                <div className="w-12 h-1 bg-sand3"><div className="h-full bg-black" style={{ width: `${flow}%` }} /></div>
                <span className="font-mono text-ink3">{flow}%</span>
              </div>
            )}
          </div>
        ) : null}
        <span className={`text-[10px] font-bold ml-2 ${didFile ? 'text-green-700' : reportPending ? 'text-ink4' : 'text-red-600'}`}>
          {didFile ? '● Filed' : reportPending ? '· Pending' : '✕ Missing'}
        </span>
        <span className="text-ink4 text-xs ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-sand3 px-4 py-2">
          {tasks.length === 0 ? (
            <p className="text-xs text-ink3 py-2">No active tasks in ClickUp.</p>
          ) : (
            <>
              {tasks.slice(0, 20).map((t) => (
                <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-2 py-2 border-b border-sand3 last:border-0 hover:bg-sand3/30 -mx-4 px-4 transition-colors group">
                  {t.priority && (
                    <span className={`text-[10px] font-bold px-1 py-0.5 flex-shrink-0 mt-0.5 ${t.priority === 'urgent' ? 'bg-black text-white' : t.priority === 'high' ? 'bg-sand2 text-ink3' : 'text-ink4'}`}>
                      {t.priority === 'urgent' ? 'URG' : t.priority === 'high' ? 'HI' : ''}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium group-hover:underline">{t.name}</div>
                    <div className="text-[11px] text-ink4">{t.list}{t.dueDate ? ` · Due ${t.dueDate}` : ''}</div>
                  </div>
                  <span className="text-ink4 text-xs">↗</span>
                </a>
              ))}
              {tasks.length > 20 && (
                <a href={`${CLICKUP_WORKSPACE_URL}/home`} target="_blank" rel="noopener noreferrer"
                  className="block text-xs text-ink4 hover:underline py-2">
                  +{tasks.length - 20} more in ClickUp ↗
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MeetingCard({ m }: { m: Meeting }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-sand3 mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-sand3/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{m.title}</div>
          <div className="text-xs text-ink3 mt-0.5">
            {m.date}{m.duration ? ` · ${m.duration}` : ''}
            {m.participants.length ? ` · ${m.participants.length} attendee${m.participants.length !== 1 ? 's' : ''}` : ''}
          </div>
          {m.teamParticipants && m.teamParticipants.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {m.teamParticipants.map(name => (
                <span key={name} className="text-[10px] font-bold bg-accent-light text-accent px-1.5 py-0.5">{name.split(' ')[0]}</span>
              ))}
            </div>
          )}
        </div>
        <span className="text-ink4 text-xs mt-0.5 flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-sand3 px-4 py-3 space-y-3">
          {m.overview && (
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-1">Overview</div>
              <p className="text-sm leading-relaxed">{m.overview}</p>
            </div>
          )}
          {m.actionItems && (
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-1">Action Items</div>
              <p className="text-sm leading-relaxed whitespace-pre-line">{m.actionItems}</p>
            </div>
          )}
          {m.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {m.keywords.slice(0, 8).map((k) => (
                <span key={k} className="text-xs border border-sand3 px-1.5 py-0.5 text-ink3">{k}</span>
              ))}
            </div>
          )}
          <a
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs font-mono border border-black/30 px-2 py-0.5 hover:bg-black hover:text-white transition-colors"
          >
            Full transcript ↗
          </a>
        </div>
      )}
    </div>
  )
}

interface WeeklyReportFull {
  id: string
  submitted_by: string
  week_label: string
  blockers: string | null
  escalations: string | null
  priorities: string | null
  goals_met: string | null
  win: string | null
  accomplishments: string | null
  friction: string | null
  went_well: string | null
  support_needed: string | null
  whats_new: string | null
  created_at: string
  ai_analysis: { summary: string; insights: string[]; actions: string[] } | null
}

import { getMondayOfWeekPT, shiftWeeks, fmtWeekRange, weekStartISO, todayPT } from '@/lib/week-utils'
const getMostRecentMonday = getMondayOfWeekPT
const fmtWeekLabel = fmtWeekRange

function hoursForMember(report: DailyReport | null, member: TeamMember): number | null {
  if (!report?.team_hours) return null
  const key = member.cuKey.toLowerCase()
  const firstName = member.name.split(' ')[0].toLowerCase()
  const entry = Object.entries(report.team_hours).find(([uname]) => {
    const u = uname.toLowerCase()
    return u.includes(key) || key.includes(u) || u.includes(firstName) || firstName.includes(u)
  })
  return entry ? entry[1] : null
}

function ReportField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-1">{label}</div>
      <p className="text-sm text-ink2 whitespace-pre-line leading-relaxed">{value}</p>
    </div>
  )
}

function WeeklyReportCard({ r, weekMonday, isMine }: { r: WeeklyReportFull; weekMonday: Date; isMine: boolean }) {
  const [open, setOpen] = useState(false)
  const submittedAt = new Date(r.created_at)
  const status = classifySubmission(r.created_at, weekMonday)
  const meta = SUBMIT_STATUS_META[status]
  const dateStr = submittedAt.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className={`border ${isMine ? 'border-accent/50' : status === 'on-time' ? 'border-sand3' : meta.border}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sand3/40 transition-colors"
      >
        <div className={`w-7 h-7 flex items-center justify-center text-xs font-bold flex-shrink-0 ${isMine ? 'bg-accent text-white' : 'bg-sand2 text-ink'}`}>
          {r.submitted_by[0]}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold">{r.submitted_by}</span>
          {isMine && <span className="text-[10px] font-bold text-accent ml-2">YOU</span>}
          <span className={`text-[10px] font-bold ml-2 ${meta.text}`} title={meta.long}>{meta.label}</span>
        </div>
        {r.win && (
          <span className="text-xs text-ink3 truncate hidden sm:block max-w-xs italic">"{r.win}"</span>
        )}
        {r.ai_analysis && (
          <span className="text-[10px] font-bold text-accent border border-accent px-1.5 py-0.5 flex-shrink-0">AI</span>
        )}
        <span className="text-xs text-ink4 flex-shrink-0">{dateStr}</span>
        <span className="text-ink4 text-xs ml-1">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-sand3 px-4 py-4 space-y-4">
          {r.ai_analysis && (
            <div className="bg-sand2 p-3 space-y-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">AI Summary</div>
              <p className="text-sm text-ink2 leading-relaxed">{r.ai_analysis.summary}</p>
              {r.ai_analysis.insights?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-ink3 mb-1">Key Insights</div>
                  <ul className="space-y-1">
                    {r.ai_analysis.insights.map((ins, i) => (
                      <li key={i} className="text-xs text-ink2 flex gap-2">
                        <span className="text-ink4 shrink-0">◆</span><span>{ins}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {r.ai_analysis.actions?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-ink3 mb-1">Recommended Actions</div>
                  <ul className="space-y-1">
                    {r.ai_analysis.actions.map((act, i) => (
                      <li key={i} className="text-xs text-ink2 flex gap-2">
                        <span className="text-amber-500 shrink-0">→</span><span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <ReportField label="1. Blockers / At Risk" value={r.blockers} />
          <ReportField label="2. Escalations" value={r.escalations} />
          <ReportField label="3. Next Week Priorities" value={r.priorities} />
          <ReportField label="4. Last Week — Done vs. Not Done" value={r.goals_met} />
          <ReportField label="5. Top Accomplishment & Business Impact" value={r.win} />
          <ReportField label="6. Full Accomplishments by Area" value={r.accomplishments} />
          <ReportField label="7. What Didn't Go Well" value={r.friction} />
          <ReportField label="8. What Went Well" value={r.went_well} />
          <ReportField label="9. Support Needed from Others" value={r.support_needed} />
          <ReportField label="10. Personal Notes" value={r.whats_new} />
        </div>
      )}
    </div>
  )
}

function meetingFieldHasContent(html: string | null | undefined): boolean {
  return !!html && html.replace(/<[^>]*>/g, '').trim().length > 0
}

function MeetingPrepCard({ r }: { r: MeetingPrepRow }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-sand3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sand3/40 transition-colors"
      >
        <div className="w-7 h-7 flex items-center justify-center text-xs font-bold flex-shrink-0 bg-sand2 text-ink">
          {r.submitted_by[0]}
        </div>
        <span className="text-sm font-bold flex-1">{r.submitted_by}</span>
        <span className="text-ink4 text-xs ml-1">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-sand3 px-4 py-4 space-y-4">
          {MEETING_PREP_CATEGORIES.map(cat => {
            const value = r[cat.key]
            if (!meetingFieldHasContent(value)) return null
            return (
              <div key={cat.key}>
                <div className="text-xs font-bold uppercase tracking-widest text-ink3 flex items-center gap-1.5 mb-1">
                  <cat.Icon className="w-3.5 h-3.5" />
                  {cat.title}
                </div>
                <div
                  className="text-sm text-ink2 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-accent [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: value ?? '' }}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ReportsPage() {
  const [tab, setTab] = useState<'weekly' | 'submitted' | 'daily' | 'hours' | 'meeting'>('weekly')
  const [reportMembers, setReportMembers] = useState<string[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [okrs, setOkrs] = useState<OKR[]>([])
  const [slack, setSlack] = useState<SlackData | null>(null)
  const [clickup, setClickUp] = useState<ClickUpData | null>(null)
  const [currentWeekReports, setCurrentWeekReports] = useState<{ submitted_by: string; created_at: string }[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [lastFetched, setLastFetched] = useState('')
  const { isAdmin, me } = useMe()
  const [dailyHistory, setDailyHistory] = useState<DailyReport[]>([])
  const [dailyLoading, setDailyLoading] = useState(false)
  const [selectedDailyDate, setSelectedDailyDate] = useState<string>(() => todayPT())
  const [selectedDailyReport, setSelectedDailyReport] = useState<DailyReport | null>(null)
  const [selectedDailyLoading, setSelectedDailyLoading] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [weekMon, setWeekMon] = useState<Date>(() => getMostRecentMonday(new Date()))
  const [weekReports, setWeekReports] = useState<WeeklyReportFull[]>([])
  const [weekReportsLoading, setWeekReportsLoading] = useState(false)
  const [filterMember, setFilterMember] = useState('')
  const [webworkData, setWebworkData] = useState<{ week: string[]; lastWeek?: string[]; members: WebWorkMember[]; error?: string } | null>(null)
  const [webworkLoading, setWebworkLoading] = useState(false)
  const [meetingDate, setMeetingDate] = useState<Date>(() => nextMeetingDate())
  const [meetingSubmissions, setMeetingSubmissions] = useState<MeetingPrepRow[]>([])
  const [meetingLoading, setMeetingLoading] = useState(false)
  const [meetingFilterMember, setMeetingFilterMember] = useState('')
  const { refreshKey } = useRefresh()
  const prevKey = useRef(refreshKey)

  useEffect(() => {
    fetch('/api/team', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: Array<{ full_name: string; clickup_key: string | null; role_description: string | null; files_report: boolean; active: boolean }>) => {
        const active = (data ?? []).filter(m => m.active)
        setReportMembers(active.filter(m => m.files_report).map(m => m.full_name))
        setTeam(active.map(m => ({
          name: m.full_name,
          cuKey: m.clickup_key ?? m.full_name.split(' ')[0].toLowerCase(),
          role: m.role_description ?? '',
          filesReport: m.files_report,
        })))
      })
      .catch(() => {})
    fetch('/api/okrs', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: OKR[]) => { if (Array.isArray(data)) setOkrs(data) })
      .catch(() => {})
  }, [])

  async function fetchAll(signal?: AbortSignal) {
    setLoading(true)
    const [s, c, f, wr] = await Promise.all([
      fetch('/api/slack-stats', { signal, cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/clickup-tasks', { signal, cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/fireflies-meetings', { signal, cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      // Authoritative filed/missing source — matches week_label in Supabase,
      // unlike slack-stats' filed/missing which can never attribute a report
      // submitted through /submit (posted to Slack as the bot, not the user).
      fetch(`/api/weekly-reports?week_start=${weekStartISO(getMondayOfWeekPT())}`, { signal, cache: 'no-store' }).then((r) => r.json()).catch(() => []),
    ])
    setSlack(s)
    setClickUp(c)
    setMeetings(f?.meetings ?? [])
    setCurrentWeekReports(Array.isArray(wr) ? wr : [])
    setLoading(false)
    setLastFetched(new Date().toLocaleTimeString())
  }

  async function fetchDailyHistory() {
    setDailyLoading(true)
    const res = await fetch('/api/reports/daily').then(r => r.json()).catch(() => [])
    setDailyHistory(res ?? [])
    setDailyLoading(false)
  }

  async function fetchWebwork() {
    setWebworkLoading(true)
    const res = await fetch('/api/webwork').then(r => r.json()).catch(() => null)
    setWebworkData(res)
    setWebworkLoading(false)
  }

  async function fetchSubmittedForWeek(mon: Date) {
    setWeekReportsLoading(true)
    const weekStart = weekStartISO(mon)
    const res = await fetch(`/api/weekly-reports?week_start=${weekStart}`, { cache: 'no-store' }).then(r => r.json()).catch(() => [])
    setWeekReports(Array.isArray(res) ? res : [])
    setWeekReportsLoading(false)
  }

  async function generateNow() {
    setGeneratingReport(true)
    await fetch('/api/reports/daily', { method: 'POST' })
    await fetchDailyHistory()
    setSelectedDailyDate(todayPT())
    setGeneratingReport(false)
  }

  async function fetchMeetingPrep(date: Date) {
    setMeetingLoading(true)
    const iso = meetingDateISO(date)
    const res = await fetch(`/api/meeting-prep?meeting_date=${iso}`, { cache: 'no-store' }).then(r => r.json()).catch(() => [])
    setMeetingSubmissions(Array.isArray(res) ? res : [])
    setMeetingLoading(false)
  }

  useEffect(() => {
    const ctrl = new AbortController()
    fetchAll(ctrl.signal)
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    if (tab === 'daily') fetchDailyHistory()
    if (tab === 'hours') fetchWebwork()
    if (tab === 'submitted') fetchSubmittedForWeek(weekMon)
    if (tab === 'meeting') fetchMeetingPrep(meetingDate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    if (tab === 'meeting') fetchMeetingPrep(meetingDate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingDate])

  // Resolve the report for the calendar-selected day: use the already-fetched
  // history if it's in the last 30 days, otherwise fetch that single date.
  useEffect(() => {
    if (tab !== 'daily') return
    const cached = dailyHistory.find(r => r.report_date === selectedDailyDate)
    if (cached) { setSelectedDailyReport(cached); setSelectedDailyLoading(false); return }
    if (dailyLoading) return
    setSelectedDailyLoading(true)
    fetch(`/api/reports/daily?date=${selectedDailyDate}`)
      .then(r => r.json())
      .then(res => setSelectedDailyReport(res ?? null))
      .catch(() => setSelectedDailyReport(null))
      .finally(() => setSelectedDailyLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedDailyDate, dailyHistory, dailyLoading])

  useEffect(() => {
    if (tab === 'submitted') fetchSubmittedForWeek(weekMon)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekMon])

  useEffect(() => {
    if (refreshKey === prevKey.current) return
    prevKey.current = refreshKey
    const ctrl = new AbortController()
    fetchAll(ctrl.signal)
    return () => ctrl.abort()
  }, [refreshKey])

  // Authoritative filed/missing — matched against weekly_reports by week_label,
  // not slack-stats' Slack-timestamp guess (see fetchAll).
  const filed = reportMembers.filter(name => currentWeekReports.some(r => isReportFrom(r.submitted_by, name)))
  const missing = reportMembers.filter(name => !filed.includes(name))
  const week = fmtWeekLabel(getMondayOfWeekPT())
  const slackStats = slack?.slackStats

  // Build full Slack report message
  const fullReportMsg = [
    `📊 *Weekly Roll-Up Report — Week of ${week}*`,
    ``,
    `*TEAM REPORTS*`,
    `Filed: ${filed.length}/${reportMembers.length} — ${filed.map(n => n.split(' ')[0]).join(', ') || 'none'}`,
    missing.length ? `Missing: ${missing.map(n => n.split(' ')[0]).join(', ')}` : '✅ All filed',
    ``,
    `*CRM HEALTH*`,
    clickup ? `${clickup.overduePercent}% overdue (${clickup.overdue}/${clickup.totalTasks} tasks) · ${clickup.urgent} urgent` : 'Data unavailable',
    ``,
    `*OKRs*`,
    okrs.map(o => `${o.label} — ${o.pct}% (${o.note})`).join('\n'),
    ``,
    `_Posted from Visual Chief of Staff_`,
  ].join('\n')

  const TABS = [
    { id: 'weekly', label: 'Weekly Roll-Up' },
    { id: 'submitted', label: 'Submitted Reports' },
    { id: 'meeting', label: 'Team Meeting' },
    { id: 'daily', label: 'Daily History' },
    { id: 'hours', label: 'Team Hours' },
  ] as const

  return (
    <div>
      {/* Tab bar */}
      <div className="mt-6">
        <TabBar
          tabs={TABS}
          active={tab}
          onChange={setTab}
          right={isAdmin && tab === 'daily' ? (
            <button
              onClick={generateNow}
              disabled={generatingReport}
              className="btn-primary text-xs py-1 px-3"
            >
              {generatingReport ? 'Generating…' : 'Generate Now'}
            </button>
          ) : undefined}
        />
      </div>

      {/* ── SUBMITTED REPORTS TAB ───────────────────────────── */}
      {tab === 'submitted' && (() => {
        const currentMonday = getMostRecentMonday(new Date())
        const isCurrentWeek = weekMon.getTime() === currentMonday.getTime()
        const myName = me?.fullName ?? null
        // The API already restricts non-managers to their own reports; the UI
        // mirrors that by hiding the team roster/filter for them.

        const filtered = weekReports.filter(r =>
          !filterMember || r.submitted_by === filterMember
        )
        const statusOf = (r: WeeklyReportFull): SubmitStatus => classifySubmission(r.created_at, weekMon)
        // On-time → weekend → late
        const orderRank: Record<SubmitStatus, number> = { 'on-time': 0, weekend: 1, late: 2 }
        const sorted = [...filtered].sort((a, b) => orderRank[statusOf(a)] - orderRank[statusOf(b)])

        const submittedNames = new Set(weekReports.map(r => r.submitted_by))
        const onTimeCount  = weekReports.filter(r => statusOf(r) === 'on-time').length
        const weekendCount = weekReports.filter(r => statusOf(r) === 'weekend').length
        const lateCount    = weekReports.filter(r => statusOf(r) === 'late').length
        // Not-filed counts as "missing" only after Friday; before then it's pending.
        const deadlinePassed = reportDeadlinePassed(weekMon)
        const notFiled = reportMembers.filter(n => !submittedNames.has(n))
        const missingCount = deadlinePassed ? notFiled.length : 0
        const pendingCount = deadlinePassed ? 0 : notFiled.length

        return (
          <div className="space-y-4">
            {/* Week navigation */}
            <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
              <button
                onClick={() => setWeekMon(d => shiftWeeks(d, -1))}
                className="text-ink4 hover:text-ink text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-sand3 transition-colors"
                title="Previous week"
              >‹</button>
              <span className="text-sm font-semibold tabular-nums">{fmtWeekLabel(weekMon)}</span>
              <button
                onClick={() => setWeekMon(d => shiftWeeks(d, 1))}
                disabled={isCurrentWeek}
                className="text-ink4 hover:text-ink text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-sand3 transition-colors disabled:opacity-30"
                title="Next week"
              >›</button>
              {!isCurrentWeek && (
                <button
                  onClick={() => setWeekMon(getMostRecentMonday(new Date()))}
                  className="text-xs text-accent hover:underline"
                >
                  Current week
                </button>
              )}
              <WeekCalendar selectedMonday={weekMon} onSelectWeek={setWeekMon} />
              {isAdmin && (
                <div className="flex gap-3 text-xs text-ink4 ml-auto">
                  {onTimeCount > 0  && <span className="text-success font-semibold">{onTimeCount} on time</span>}
                  {weekendCount > 0 && <span className="text-warning font-semibold">{weekendCount} weekend</span>}
                  {lateCount > 0    && <span className="text-danger font-semibold">{lateCount} late</span>}
                  {missingCount > 0 && <span className="text-danger font-semibold">{missingCount} not submitted</span>}
                  {pendingCount > 0 && <span className="text-ink4 font-semibold">{pendingCount} pending</span>}
                </div>
              )}
            </div>

            {/* Personal status (non-managers) */}
            {!isAdmin && myName && (() => {
              const mine = weekReports.find(r => r.submitted_by === myName)
              if (mine) {
                const st = classifySubmission(mine.created_at, weekMon)
                const alertClass = st === 'on-time' ? 'alert-green' : st === 'weekend' ? 'alert-amber' : 'alert-red'
                const when = new Date(mine.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT'
                return (
                  <div className={`alert ${alertClass}`}>
                    <FiCheck className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>You filed your report for {fmtWeekLabel(weekMon)} — submitted {when}{st !== 'on-time' ? ` (${SUBMIT_STATUS_META[st].label.toLowerCase()})` : ''}.</span>
                  </div>
                )
              }
              return (
                <div className={`alert ${deadlinePassed ? 'alert-red' : 'alert-amber'} items-center justify-between`}>
                  <span className="flex items-center gap-2">
                    <FiAlertTriangle className="w-4 h-4 shrink-0" />
                    {deadlinePassed
                      ? `You haven’t filed your report for ${fmtWeekLabel(weekMon)} — the Friday deadline has passed.`
                      : `Your report for ${fmtWeekLabel(weekMon)} is pending — due Friday.`}
                  </span>
                  {isCurrentWeek && <a href="/submit" className="btn-primary text-xs py-1 px-3 whitespace-nowrap">Submit now</a>}
                </div>
              )
            })()}

            {/* Member status chips (managers only) */}
            {isAdmin && <div className="card">
              <div className="card-hd">
                <div className="card-ti">
                  {isCurrentWeek ? 'This Week' : fmtWeekLabel(weekMon)}
                </div>
                <div className="text-xs text-ink3">
                  {weekReportsLoading ? 'Loading…' : `${weekReports.length} of ${reportMembers.length} submitted`}
                </div>
              </div>
              <div className="card-body p-3">
                <div className="flex flex-wrap gap-2">
                  {reportMembers.map(name => {
                    const report = weekReports.find(r => r.submitted_by === name)
                    const st = report ? classifySubmission(report.created_at, weekMon) : null
                    const chipClass =
                      filterMember === name ? 'border-ink bg-ink text-white'
                      : st === null      ? 'border-sand3 text-ink4 bg-sand2 hover:border-ink3'
                      : st === 'on-time' ? 'border-success/50 text-success bg-success-light hover:opacity-80'
                      : st === 'weekend' ? 'border-warning/50 text-warning bg-warning-light hover:opacity-80'
                      :                    'border-danger/50 text-danger bg-danger-light hover:opacity-80'
                    const icon = st === 'on-time' ? '✓' : st === 'weekend' ? '~' : st === 'late' ? '!' : null
                    return (
                      <button
                        key={name}
                        onClick={() => setFilterMember(filterMember === name ? '' : name)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border transition-colors ${chipClass}`}
                        title={report ? SUBMIT_STATUS_META[st!].long : (deadlinePassed ? 'Not submitted' : 'Pending — due Friday')}
                      >
                        {icon && <span>{icon}</span>}
                        <span>{name.split(' ')[0]}</span>
                      </button>
                    )
                  })}
                </div>
                {notFiled.length > 0 && !weekReportsLoading && (
                  <p className={`text-xs mt-2 ${deadlinePassed ? 'text-red-600' : 'text-ink4'}`}>
                    {deadlinePassed ? 'Not submitted' : 'Pending (due Friday)'}: {notFiled.map(n => n.split(' ')[0]).join(', ')}
                  </p>
                )}
              </div>
            </div>}

            {/* Member filter + count (managers only) */}
            {isAdmin && weekReports.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={filterMember}
                  onChange={e => setFilterMember(e.target.value)}
                  className="field-input text-xs py-1.5 w-full sm:w-auto"
                >
                  <option value="">All members</option>
                  {reportMembers.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                {filterMember && (
                  <button onClick={() => setFilterMember('')} className="text-xs text-ink4 hover:text-ink underline">
                    Clear
                  </button>
                )}
                <span className="text-xs text-ink4 ml-auto">{sorted.length} report{sorted.length !== 1 ? 's' : ''}</span>
              </div>
            )}

            {/* Report cards */}
            {weekReportsLoading ? (
              <div className="py-4"><Spinner label="Loading reports…" className="text-ink4 text-sm" /></div>
            ) : sorted.length === 0 ? (
              isAdmin ? (
                <div className="card p-6 text-center text-ink4 text-sm">
                  {filterMember
                    ? `${filterMember} has not submitted a report for this week.`
                    : `No reports submitted for the week of ${fmtWeekLabel(weekMon)}.`
                  }
                </div>
              ) : null
            ) : (
              <div className="space-y-2">
                {sorted.map(r => (
                  <WeeklyReportCard key={r.id} r={r} weekMonday={weekMon} isMine={myName === r.submitted_by} />
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── TEAM MEETING TAB ─────────────────────────────────── */}
      {tab === 'meeting' && (() => {
        const currentMeeting = nextMeetingDate()
        const isCurrentMeeting = meetingDateISO(meetingDate) === meetingDateISO(currentMeeting)
        const meetingLabel = `${meetingTypeOf(meetingDate) === 'monday' ? 'Monday' : 'Thursday'} Leadership Meeting`
        const deadlinePassed = meetingDeadlinePassed(meetingDate)
        const myName = me?.fullName ?? null
        // Leadership isn't a meeting participant expected to file an update.
        const participantNames = team.map(m => m.name).filter(n => n !== myName)
        const submittedNames = new Set(meetingSubmissions.map(s => s.submitted_by))
        const notSubmitted = participantNames.filter(n => !submittedNames.has(n))
        const filtered = meetingSubmissions.filter(s => !meetingFilterMember || s.submitted_by === meetingFilterMember)
        const sorted = [...filtered].sort((a, b) => participantNames.indexOf(a.submitted_by) - participantNames.indexOf(b.submitted_by))
        const mine = meetingSubmissions.find(s => s.submitted_by === myName)

        return (
          <div className="space-y-4">
            {/* Meeting navigation */}
            <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
              <button
                onClick={() => setMeetingDate(d => adjacentMeetingDate(d, -1))}
                className="text-ink4 hover:text-ink text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-sand3 transition-colors"
                title="Previous meeting"
              ><FiChevronLeft /></button>
              <span className="text-sm font-semibold">{meetingLabel} — {fmtMeetingDate(meetingDate)}</span>
              <button
                onClick={() => setMeetingDate(d => adjacentMeetingDate(d, 1))}
                className="text-ink4 hover:text-ink text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-sand3 transition-colors"
                title="Next meeting"
              ><FiChevronRight /></button>
              {!isCurrentMeeting && (
                <button onClick={() => setMeetingDate(currentMeeting)} className="text-xs text-accent hover:underline">
                  Current meeting
                </button>
              )}
              <span className={`text-xs font-semibold ml-2 ${deadlinePassed ? 'text-ink4' : 'text-warning'}`}>
                {deadlinePassed ? `Closed (were due ${fmtDeadline(meetingDate)})` : `Due ${fmtDeadline(meetingDate)} EOD`}
              </span>
            </div>

            {/* Personal status (non-admins) */}
            {!isAdmin && myName && (
              mine ? (
                <div className="alert alert-green">
                  <FiCheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>You submitted your update for {fmtMeetingDate(meetingDate)}.</span>
                </div>
              ) : (
                <div className={`alert ${deadlinePassed ? 'alert-red' : 'alert-amber'} items-center justify-between`}>
                  <span className="flex items-center gap-2">
                    <FiAlertTriangle className="w-4 h-4 shrink-0" />
                    {deadlinePassed
                      ? `You haven’t submitted your update for ${fmtMeetingDate(meetingDate)} — the deadline has passed.`
                      : `Your update for ${fmtMeetingDate(meetingDate)} is pending — due ${fmtDeadline(meetingDate)}.`}
                  </span>
                  {!deadlinePassed && <a href="/meeting-prep" className="btn-primary text-xs py-1 px-3 whitespace-nowrap">Submit now</a>}
                </div>
              )
            )}

            {/* Member status chips (admins only) */}
            {isAdmin && (
              <div className="card">
                <div className="card-hd">
                  <div className="card-ti">{isCurrentMeeting ? 'This Meeting' : fmtMeetingDate(meetingDate)}</div>
                  <div className="text-xs text-ink3">
                    {meetingLoading ? 'Loading…' : `${participantNames.filter(n => submittedNames.has(n)).length} of ${participantNames.length} submitted`}
                  </div>
                </div>
                <div className="card-body p-3">
                  <div className="flex flex-wrap gap-2">
                    {participantNames.map(name => {
                      const submitted = submittedNames.has(name)
                      const chipClass =
                        meetingFilterMember === name ? 'border-ink bg-ink text-white'
                        : submitted ? 'border-success/50 text-success bg-success-light hover:opacity-80'
                        : deadlinePassed ? 'border-danger/50 text-danger bg-danger-light hover:opacity-80'
                        : 'border-sand3 text-ink4 bg-sand2 hover:border-ink3'
                      return (
                        <button
                          key={name}
                          onClick={() => setMeetingFilterMember(f => f === name ? '' : name)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border rounded-full transition-colors ${chipClass}`}
                          title={submitted ? 'Submitted' : deadlinePassed ? 'Not submitted' : 'Pending'}
                        >
                          {submitted ? <FiCheckCircle className="w-3.5 h-3.5" /> : <FiClock className="w-3.5 h-3.5" />}
                          {name}
                        </button>
                      )
                    })}
                  </div>
                  {notSubmitted.length > 0 && !meetingLoading && (
                    <p className={`text-xs mt-2 ${deadlinePassed ? 'text-danger' : 'text-ink4'}`}>
                      {deadlinePassed ? 'Not submitted' : 'Pending'}: {notSubmitted.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Filter status (admins only) */}
            {isAdmin && meetingSubmissions.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                {meetingFilterMember && (
                  <button onClick={() => setMeetingFilterMember('')} className="text-xs text-ink4 hover:text-ink underline">
                    Clear filter
                  </button>
                )}
                <span className="text-xs text-ink4 ml-auto">{sorted.length} update{sorted.length !== 1 ? 's' : ''}</span>
              </div>
            )}

            {/* Per-person cards (admins only) */}
            {isAdmin && (
              meetingLoading ? (
                <div className="py-4"><Spinner label="Loading updates…" className="text-ink4 text-sm" /></div>
              ) : sorted.length === 0 ? (
                <div className="card p-6 text-center text-ink4 text-sm">
                  {meetingFilterMember
                    ? `${meetingFilterMember} has not submitted an update for this meeting.`
                    : `No updates submitted for ${fmtMeetingDate(meetingDate)}.`}
                </div>
              ) : (
                <div className="space-y-2">
                  {sorted.map(s => <MeetingPrepCard key={s.id} r={s} />)}
                </div>
              )
            )}
          </div>
        )
      })()}

      {/* ── DAILY HISTORY TAB ────────────────────────────────── */}
      {tab === 'daily' && (() => {
        const reportedDates = new Set(dailyHistory.map(r => r.report_date))
        const r = selectedDailyReport
        const isToday = selectedDailyDate === todayPT()
        const dateLabel = (iso: string, opts: Intl.DateTimeFormatOptions) =>
          new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', ...opts })

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <DayCalendar selectedDate={selectedDailyDate} onSelectDate={setSelectedDailyDate} markedDates={reportedDates} />
              {!isToday && (
                <button onClick={() => setSelectedDailyDate(todayPT())} className="text-xs text-accent hover:underline">
                  Jump to today
                </button>
              )}
            </div>

            {selectedDailyLoading || (dailyLoading && !r) ? (
              <div className="text-ink4 text-sm animate-pulse">Loading report…</div>
            ) : !r ? (
              <div className="card p-6 text-center text-ink4 text-sm">
                No daily report for {dateLabel(selectedDailyDate, { weekday: 'long', month: 'short', day: 'numeric' })}.
                {isAdmin && isToday && ' Click "Generate Now" to create it.'}
              </div>
            ) : (
              <>
                <div className="card divide-y divide-sand3">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="font-bold text-sm">{dateLabel(r.report_date, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                    <div className="flex gap-4 text-xs text-ink3">
                      <span>✅ {r.reports_filed?.length ?? 0} filed</span>
                      {(r.reports_missing?.length ?? 0) > 0 && <span className="text-red-600">❌ {r.reports_missing.length} missing</span>}
                      <span>{r.overdue_count} overdue</span>
                      <span>{r.urgent_count} urgent</span>
                    </div>
                  </div>
                </div>

                <div className="slbl">All Team Members</div>
                <div className="card divide-y divide-sand3">
                  {team.map(member => {
                    const filed = r.reports_filed?.includes(member.name)
                    const missing = r.reports_missing?.includes(member.name)
                    const hrs = hoursForMember(r, member)
                    const status: 'exempt' | 'filed' | 'missing' | 'unknown' =
                      !member.filesReport ? 'exempt' : filed ? 'filed' : missing ? 'missing' : 'unknown'
                    return (
                      <div key={member.name} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-7 h-7 flex items-center justify-center text-xs font-bold flex-shrink-0 bg-sand2 text-ink">
                          {member.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold">{member.name}</span>
                          {member.role && <span className="text-xs text-ink4 ml-2">{member.role}</span>}
                        </div>
                        {hrs != null && <span className="text-xs font-mono text-ink3">{hrs}h</span>}
                        <span className={`text-[10px] font-bold ${
                          status === 'filed' ? 'text-green-700'
                          : status === 'missing' ? 'text-red-600'
                          : 'text-ink4'
                        }`}>
                          {status === 'filed' ? '● Filed' : status === 'missing' ? '✕ Missing' : status === 'exempt' ? 'Exempt' : '— No data'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )
      })()}

      {/* ── TEAM HOURS TAB ───────────────────────────────────── */}
      {tab === 'hours' && (
        <div className="space-y-4">
          {webworkLoading ? (
            <div className="text-ink4 text-sm animate-pulse">Loading WebWork hours…</div>
          ) : !webworkData || !webworkData.members ? (
            <div className="card p-6 text-center text-ink4 text-sm">
              {webworkData?.error ?? 'Failed to load WebWork data. Check WEBWORK_API_KEY.'}
            </div>
          ) : (
            <>
              <div className="text-xs text-ink3">
                Week of {webworkData.week?.[0]} – {webworkData.week?.[webworkData.week.length - 1]}
                <span className="ml-3 font-semibold text-ink">
                  {Math.round(webworkData.members.reduce((s, m) => s + m.totalHours, 0) * 10) / 10}h total
                </span>
              </div>

              {/* Trend cards */}
              <TrendCards
                members={webworkData.members}
                weekLabel={webworkData.week?.[0] ?? ''}
                lastWeekLabel={webworkData.lastWeek?.[0] ?? 'prior week'}
              />

              {/* Bar chart */}
              <div className="card px-4 pt-4 pb-2">
                <div className="slbl mb-0 text-xs">Hours This Week</div>
                <HoursBar members={webworkData.members} />
              </div>

              {/* Stacked by day */}
              <DayStackedBar members={webworkData.members} />

              {/* Detail rows */}
              <div className="card divide-y divide-sand3">
                {[...webworkData.members].sort((a, b) => b.totalHours - a.totalHours).map((m, i) => (
                  <div key={m.username} className="flex items-center gap-3 px-4 py-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
                      style={{ background: i === 0 ? '#4F46E5' : i === 1 ? '#818CF8' : '#C7D2FE', color: i < 2 ? '#fff' : '#4F46E5' }}
                    >
                      {m.username[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold capitalize flex-1">{m.username}</span>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-20 sm:w-28 h-2 bg-sand3 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (m.totalHours / 40) * 100)}%`,
                            background: i === 0 ? '#4F46E5' : i === 1 ? '#818CF8' : '#C7D2FE',
                          }}
                        />
                      </div>
                      <span className="font-mono text-sm w-12 text-right tabular-nums">{m.totalHours}h</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── WEEKLY ROLL-UP TAB ───────────────────────────────── */}
      {tab === 'weekly' && <>
      <div className="flex items-center justify-between mb-1">
        <div className="slbl mb-0">Weekly Roll-Up — {week}</div>
        <div className="flex items-center gap-2">
          {lastFetched && <span className="text-xs text-ink4">Updated {lastFetched}</span>}
          <StaleBadge
            ageMinutes={(clickup as {_ageMinutes?: number})?._ageMinutes}
            circuitOpen={(clickup as {_circuitOpen?: boolean})?._circuitOpen}
          />
        </div>
      </div>

      {/* Executive summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          {
            value: loading ? '…' : `${filed.length}/${reportMembers.length}`,
            label: 'Reports Filed',
            sub: loading ? '' : !missing.length ? 'All filed ✓'
              : reportDeadlinePassed(getMostRecentMonday(new Date()))
                ? `Not submitted: ${missing.map(n => n.split(' ')[0]).join(', ')}`
                : `Pending (due Friday): ${missing.map(n => n.split(' ')[0]).join(', ')}`,
            alert: !loading && missing.length > 0 && reportDeadlinePassed(getMostRecentMonday(new Date())),
          },
          {
            value: loading ? '…' : `${clickup?.overduePercent ?? '—'}%`,
            label: 'CRM Overdue',
            sub: loading ? '' : clickup ? `${clickup.overdue} of ${clickup.totalTasks} tasks` : 'Error',
            alert: !loading && (clickup?.overduePercent ?? 0) > 50,
          },
          {
            value: loading ? '…' : clickup?.urgent ?? '—',
            label: 'Urgent Tasks',
            sub: loading ? '' : 'Need immediate action',
            alert: !loading && (clickup?.urgent ?? 0) > 0,
          },
          {
            value: loading ? '…' : meetings.length,
            label: 'Meetings',
            sub: loading ? '' : 'From Fireflies this period',
            alert: false,
          },
        ].map((s) => (
          <div key={s.label} className={`border p-3 ${s.alert ? 'border-red-300 bg-red-50' : 'border-sand3'} ${loading ? 'animate-pulse' : ''}`}>
            <div className="font-serif font-black text-2xl sm:text-3xl">{s.value}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink3 mt-0.5">{s.label}</div>
            {s.sub && <div className="text-xs text-ink4 mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Team status roll-up */}
      <Section title="Team Assignment Roll-Up">
        <div className="space-y-2">
          {team.map((member) => {
            const stats = clickup?.assigneeStats
              ? Object.entries(clickup.assigneeStats).find(([k]) => k.includes(member.cuKey))?.[1]
              : null
            const tasks = clickup?.tasksByAssignee
              ? Object.entries(clickup.tasksByAssignee).find(([k]) => k.includes(member.cuKey))?.[1] ?? []
              : []
            const didFile = filed.includes(member.name)
            const flow = stats && stats.total > 0
              ? Math.max(5, Math.round(100 - (stats.overdue / stats.total) * 100))
              : null
            return (
              <MemberRollup
                key={member.name}
                name={member.name}
                stats={stats ?? null}
                tasks={tasks}
                didFile={didFile}
                flow={flow}
                loading={loading}
                deadlinePassed={reportDeadlinePassed(getMostRecentMonday(new Date()))}
              />
            )
          })}
        </div>
      </Section>

      {/* Urgent + high priority tasks */}
      {!loading && ((clickup?.urgentDetails?.length ?? 0) > 0 || (clickup?.highDetails?.length ?? 0) > 0) && (
        <Section title="Priority Action Items">
          <div className="space-y-1.5">
            {[...(clickup?.urgentDetails ?? []), ...(clickup?.highDetails ?? [])].map((t) => (
              <a
                key={t.id}
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 border border-sand3 hover:bg-sand3/30 transition-colors group"
              >
                <span className={`text-xs font-bold px-1.5 py-0.5 flex-shrink-0 ${t.priority === 'urgent' ? 'bg-black text-white' : 'bg-sand2 text-ink3'}`}>
                  {t.priority?.toUpperCase() || 'HIGH'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium group-hover:underline">{t.name}</div>
                  <div className="text-xs text-ink3 mt-0.5">
                    {t.list}{t.dueDate ? ` · Due ${t.dueDate}` : ''}{t.assignees.length ? ` · ${t.assignees.join(', ')}` : ''}
                  </div>
                </div>
                <span className="text-ink4 text-xs flex-shrink-0">↗</span>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* OKR Roll-Up */}
      <Section title="OKR Roll-Up">
        <div className="card px-5">
          <OkrRings okrs={okrs} />
        </div>
      </Section>

      {/* Slack KPIs */}
      {!loading && slackStats && (
        <Section title="Slack Communication KPIs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Messages This Week', value: slackStats.totalMessages.toLocaleString() },
              { label: 'Active Members', value: slackStats.activeMembers },
              { label: 'Public Channels', value: slackStats.channels },
            ].map((s) => (
              <div key={s.label} className="stat-tile">
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
          {slackStats.messagesByDay && slackStats.messagesByDay.length > 0 && (
            <div className="card px-4 py-4">
              <SlackHeatMap messagesByDay={slackStats.messagesByDay} />
            </div>
          )}
        </Section>
      )}

      {/* Fireflies meetings — timeline */}
      <Section title={`Meeting Intelligence${meetings.length ? ` (${meetings.length})` : ''}`}>
        {loading ? (
          <div className="card p-4 animate-pulse text-sm text-ink4">Loading meetings…</div>
        ) : (
          <MeetingTimeline meetings={meetings} />
        )}
      </Section>

      {/* Share bar */}
      {!loading && (
        <div className="flex flex-wrap gap-2 pb-8">
          <ShareSlackButton label="Post Full Report to Slack" message={fullReportMsg} />
          <a
            href={`${CLICKUP_WORKSPACE_URL}/home`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-sand3 px-3 py-1.5 text-xs font-bold hover:bg-sand2 transition-colors"
          >
            Open ClickUp ↗
          </a>
          <a
            href="https://app.fireflies.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-sand3 px-3 py-1.5 text-xs font-bold hover:bg-sand2 transition-colors"
          >
            Open Fireflies ↗
          </a>
        </div>
      )}
      </>}
    </div>
  )
}
