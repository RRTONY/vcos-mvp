'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import { ShareSlackButton } from '@/components/ShareButtons'
import { TEAM, REPORT_MEMBERS } from '@/lib/team'
import type { TeamMember } from '@/lib/team'
import type { Task, ClickUpData, SlackData } from '@/lib/types'
import StaleBadge from '@/components/StaleBadge'

const OKRS = [
  { id: 'OKR01', label: '$5M Revenue', pct: 1, note: '$31K YTD · need $95K/wk' },
  { id: 'OKR02', label: 'Pipeline', pct: 38, note: '30 active deals' },
  { id: 'OKR03', label: 'Action Close Rate', pct: 11, note: '8/75 · target 90%' },
  { id: 'OKR04', label: 'STBL Gatekeepers', pct: 10, note: 'From 23K LinkedIn DB' },
  { id: 'OKR05', label: 'Accounting Fix', pct: 40, note: 'Hiline fired · new search' },
  { id: 'OKR06', label: 'Website Migration', pct: 100, note: 'ramprate.com DONE ✓' },
]


function findStats(
  assigneeStats: Record<string, { total: number; overdue: number; urgent: number }> | undefined,
  cuKey: string
) {
  if (!assigneeStats) return null
  const key = Object.keys(assigneeStats).find((k) => k.includes(cuKey))
  return key ? assigneeStats[key] : null
}

function findTasks(tasksByAssignee: Record<string, Task[]> | undefined, cuKey: string): Task[] {
  if (!tasksByAssignee) return []
  const key = Object.keys(tasksByAssignee).find((k) => k.includes(cuKey))
  return key ? tasksByAssignee[key] : []
}

function TaskRow({ t }: { t: Task }) {
  const isUrgent = t.priority === 'urgent'
  const isHigh = t.priority === 'high'
  return (
    <a
      href={t.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 py-2 border-b border-sand3 last:border-0 hover:bg-sand3/30 -mx-4 px-4 transition-colors group"
    >
      {(isUrgent || isHigh) && (
        <span className={`text-[10px] font-bold px-1 py-0.5 flex-shrink-0 mt-0.5 ${isUrgent ? 'bg-black text-white' : 'bg-sand2 text-ink3'}`}>
          {isUrgent ? 'URG' : 'HI'}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium group-hover:underline leading-snug">{t.name}</div>
        <div className="text-[11px] text-ink4 mt-0.5">{t.list}{t.dueDate ? ` · ${t.dueDate}` : ''}</div>
      </div>
      <span className="text-ink4 text-xs flex-shrink-0">↗</span>
    </a>
  )
}

function MemberCard({
  member, stats, tasks, filed, loading,
}: {
  member: TeamMember
  stats: { total: number; overdue: number; urgent: number } | null
  tasks: Task[]
  filed: boolean
  loading: boolean
}) {
  const [open, setOpen] = useState(false)
  const flow = stats && stats.total > 0
    ? Math.max(5, Math.round(100 - (stats.overdue / stats.total) * 100))
    : null
  const hasIssues = (stats?.overdue ?? 0) > 0 || (stats?.urgent ?? 0) > 0 || !filed

  return (
    <div className={`border ${hasIssues ? 'border-ink/30' : 'border-sand3'} bg-sand`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-sand3/40 transition-colors"
      >
        {/* Avatar initial */}
        <div className={`w-8 h-8 flex items-center justify-center font-bold text-sm flex-shrink-0 ${hasIssues ? 'bg-black text-white' : 'bg-sand2 text-ink3'}`}>
          {member.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold">{member.name}</span>
            <span className="text-[11px] text-ink4">{member.role}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {loading ? (
              <span className="text-xs text-ink4 animate-pulse">Loading…</span>
            ) : stats ? (
              <>
                <span className="text-xs text-ink3">{stats.total} tasks</span>
                {stats.overdue > 0 && <span className="text-xs font-bold text-red-600">{stats.overdue} overdue</span>}
                {stats.urgent > 0 && <span className="text-xs font-bold text-amber-600">{stats.urgent} urgent</span>}
                {flow !== null && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <div className="w-12 h-1 bg-sand3">
                      <div className="h-full bg-black" style={{ width: `${flow}%` }} />
                    </div>
                    <span className="text-[11px] font-mono text-ink3">{flow}%</span>
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-ink4">No tasks in ClickUp</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {member.filesReport && (
            <span className={`text-[10px] font-bold ${filed ? 'text-green-700' : 'text-red-600'}`}>
              {filed ? '● RPT' : '✕ RPT'}
            </span>
          )}
          <span className="text-ink4 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-sand3 px-4 py-2">
          {tasks.length === 0 ? (
            <p className="text-xs text-ink3 py-2">No active tasks found in ClickUp.</p>
          ) : (
            <>
              {tasks.slice(0, 15).map((t) => <TaskRow key={t.id} t={t} />)}
              {tasks.length > 15 && (
                <a
                  href="https://app.clickup.com/10643959/home"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-ink4 hover:underline py-2"
                >
                  +{tasks.length - 15} more tasks in ClickUp ↗
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [slack, setSlack] = useState<SlackData | null>(null)
  const [clickup, setClickUp] = useState<ClickUpData | null>(null)
  const [loading, setLoading] = useState(true)
  const { refreshKey, freshClickUp } = useRefresh()
  const prevKey = useRef(refreshKey)

  const load = useCallback(async (cancelled: { v: boolean }, cachedClickUp?: Record<string, unknown> | null) => {
    setLoading(true)
    const [s, c] = await Promise.all([
      fetch('/api/slack-stats', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      cachedClickUp ? Promise.resolve(cachedClickUp) : fetch('/api/clickup-tasks', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ])
    if (!cancelled.v) {
      setSlack(s)
      setClickUp(c)
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

  const wr = slack?.weeklyReports
  const filed = wr?.filed ?? []
  const missing = wr?.missing ?? []
  const week = wr?.week ?? '—'

  // Items needing CEO attention
  const actions: { level: 'red' | 'amber' | 'blue'; text: React.ReactNode }[] = []
  if (!loading) {
    if (missing.length > 0) actions.push({
      level: 'red',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>Reports missing:</strong> {missing.join(', ')} have not filed this week.</span>
          <a href="https://app.slack.com/client/T08K6KLDMJA/C08K6KM53FV" target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">Slack channel ↗</a>
        </span>
      ),
    })
    if ((clickup?.urgent ?? 0) > 0) actions.push({
      level: 'red',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>{clickup?.urgent} urgent tasks</strong> across the team need immediate resolution.</span>
          <a href="https://app.clickup.com/10643959/home" target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">ClickUp ↗</a>
        </span>
      ),
    })
    if ((clickup?.overduePercent ?? 0) > 70) actions.push({
      level: 'red',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>CRM overdue at {clickup?.overduePercent}%</strong> — {clickup?.overdue} of {clickup?.totalTasks} tasks past due. Needs triage.</span>
          <a href="https://app.clickup.com/10643959/home" target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">ClickUp ↗</a>
        </span>
      ),
    })
    actions.push({
      level: 'red',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>BILL.com:</strong> 12 sync conflicts + Holographik invoice pending — Kim to resolve.</span>
          <a href="https://app.bill.com" target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">BILL.com ↗</a>
        </span>
      ),
    })
    actions.push({
      level: 'amber',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>Braintrust template:</strong> 4-point checklist not integrated. Kim due Mar 18.</span>
          <a href="https://app.clickup.com/t/868hwv6u4" target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">Task ↗</a>
        </span>
      ),
    })
    actions.push({
      level: 'blue',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>Decision needed:</strong> ImpactSoul legal entity formation — no entity = no grants, no Series A.</span>
          <a href="https://app.clickup.com/10643959/home" target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">Add task ↗</a>
        </span>
      ),
    })
  }

  const shareMsg = [
    `📊 *CEO Status Brief — Week of ${week}*`,
    `Reports: ${filed.length}/${REPORT_MEMBERS.length} filed${missing.length ? ` · Missing: ${missing.map(n => n.split(' ')[0]).join(', ')}` : ' ✅'}`,
    clickup ? `CRM: ${clickup.overduePercent}% overdue (${clickup.overdue}/${clickup.totalTasks}) · ${clickup.urgent} urgent` : '',
    `_From Visual Chief of Staff_`,
  ].filter(Boolean).join('\n')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mt-6 mb-4">
        <div>
          <h1 className="font-display text-2xl tracking-widest">CEO COMMAND</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-ink4">Week of {week}</span>
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

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          {
            value: loading ? '…' : `${filed.length}/${REPORT_MEMBERS.length}`,
            label: 'Reports Filed',
            sub: loading ? '' : missing.length ? `${missing.length} missing` : 'All filed ✓',
            alert: !loading && missing.length > 0,
          },
          {
            value: loading ? '…' : (clickup?.urgent ?? '—'),
            label: 'Urgent Tasks',
            sub: 'Across all team members',
            alert: !loading && (clickup?.urgent ?? 0) > 0,
          },
          {
            value: loading ? '…' : `${clickup?.overduePercent ?? '—'}%`,
            label: 'CRM Overdue',
            sub: loading ? '' : clickup ? `${clickup.overdue} of ${clickup.totalTasks} tasks` : '',
            alert: !loading && (clickup?.overduePercent ?? 0) > 50,
          },
          {
            value: loading ? '…' : (clickup?.totalTasks ?? '—'),
            label: 'Total Active Tasks',
            sub: loading ? '' : `${clickup?.completed ?? 0} completed`,
            alert: false,
          },
        ].map((s) => (
          <div key={s.label} className={`border p-3 ${s.alert ? 'border-red-400 bg-red-50' : 'border-sand3'} ${loading ? 'animate-pulse' : ''}`}>
            <div className="font-serif font-black text-3xl">{s.value}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink3 mt-0.5">{s.label}</div>
            {s.sub && <div className="text-xs text-ink4 mt-0.5">{s.sub}</div>}
          </div>
        ))}
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

      {/* Team Assignment Board */}
      <div className="slbl mt-6">Team Assignment Board</div>
      <p className="text-xs text-ink4 mb-3">Click any team member to see their assigned tasks from ClickUp.</p>
      <div className="space-y-2 mb-6">
        {TEAM.map((member) => (
          <MemberCard
            key={member.name}
            member={member}
            stats={findStats(clickup?.assigneeStats, member.cuKey)}
            tasks={findTasks(clickup?.tasksByAssignee, member.cuKey)}
            filed={filed.some((f) => f.toLowerCase().includes(member.cuKey))}
            loading={loading}
          />
        ))}
      </div>

      {/* OKR Pulse */}
      <div className="slbl">OKR Pulse</div>
      <div className="card mb-6">
        <div className="card-body p-0">
          <table className="w-full text-sm">
            <tbody>
              {OKRS.map((o) => (
                <tr key={o.id} className="border-b border-sand3 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-ink4 w-16">{o.id}</td>
                  <td className="px-4 py-2.5 font-bold">{o.label}</td>
                  <td className="px-4 py-2.5 w-32">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-sand3">
                        <div className="h-full bg-black" style={{ width: `${Math.max(o.pct, 2)}%` }} />
                      </div>
                      <span className="font-mono text-xs w-8 text-right">{o.pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink3 hidden sm:table-cell">{o.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
