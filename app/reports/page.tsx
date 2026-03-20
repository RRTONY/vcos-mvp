'use client'

import { useEffect, useState, useRef } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import { ShareSlackButton } from '@/components/ShareButtons'

interface SlackData {
  weeklyReports?: { filed: string[]; missing: string[]; week: string }
  slackStats?: { totalMessages: number; activeMembers: number; channels: number }
}

interface OverdueTask {
  id: string; name: string; list: string; dueDate: string
  priority: string; url: string; assignees: string[]
}

interface ClickUpData {
  totalTasks?: number; overdue?: number; overduePercent?: number
  urgent?: number; completed?: number
  urgentDetails?: OverdueTask[]; highDetails?: OverdueTask[]
  overdueDetails?: OverdueTask[]
  assigneeStats?: Record<string, { total: number; overdue: number; urgent: number }>
  tasksByAssignee?: Record<string, OverdueTask[]>
}

interface Meeting {
  id: string; title: string; date: string; duration: string
  participants: string[]; overview: string; actionItems: string
  keywords: string[]; url: string
}

const TEAM = ['Rob Holmes', 'Alex Veytsel', 'Josh Bykowski', 'Kim', 'Chase', 'Daniel Baez', 'Ben Sheppard', 'Tony']
const TEAM_CU: Record<string, string> = {
  'Rob Holmes': 'rob', 'Alex Veytsel': 'alex', 'Josh Bykowski': 'josh',
  'Kim': 'kim', 'Chase': 'chase', 'Daniel Baez': 'daniel', 'Ben Sheppard': 'ben', 'Tony': 'tonyg',
}

const OKRS = [
  { id: 'OKR01', label: '$5M Revenue', pct: 1, note: '$31K YTD · need $95K/wk' },
  { id: 'OKR02', label: 'Pipeline', pct: 38, note: '30 active deals' },
  { id: 'OKR03', label: 'Action Close Rate', pct: 11, note: '8/75 · target 90%' },
  { id: 'OKR04', label: 'STBL Gatekeepers', pct: 10, note: 'From 23K LinkedIn DB' },
  { id: 'OKR05', label: 'Accounting Fix', pct: 40, note: 'Hiline fired · new search' },
  { id: 'OKR06', label: 'Website Migration', pct: 100, note: 'ramprate.com DONE ✓' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="slbl">{title}</div>
      {children}
    </div>
  )
}

function MemberRollup({ name, stats, tasks, didFile, flow, loading }: {
  name: string; cuKey: string
  stats: { total: number; overdue: number; urgent: number } | null
  tasks: OverdueTask[]; didFile: boolean; flow: number | null; loading: boolean
}) {
  const [open, setOpen] = useState(false)
  const hasIssues = (stats?.overdue ?? 0) > 0 || (stats?.urgent ?? 0) > 0 || !didFile
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
        <span className={`text-[10px] font-bold ml-2 ${didFile ? 'text-green-700' : 'text-red-600'}`}>
          {didFile ? '● Filed' : '✕ Missing'}
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
                <a href="https://app.clickup.com/10643959/home" target="_blank" rel="noopener noreferrer"
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
            {m.participants.length ? ` · ${m.participants.slice(0, 3).join(', ')}${m.participants.length > 3 ? ` +${m.participants.length - 3}` : ''}` : ''}
          </div>
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

export default function ReportsPage() {
  const [slack, setSlack] = useState<SlackData | null>(null)
  const [clickup, setClickUp] = useState<ClickUpData | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [lastFetched, setLastFetched] = useState('')
  const { refreshKey } = useRefresh()
  const prevKey = useRef(refreshKey)

  async function fetchAll(signal?: AbortSignal) {
    setLoading(true)
    const [s, c, f] = await Promise.all([
      fetch('/api/slack-stats', { signal }).then((r) => r.json()).catch(() => null),
      fetch('/api/clickup-tasks', { signal }).then((r) => r.json()).catch(() => null),
      fetch('/api/fireflies-meetings', { signal }).then((r) => r.json()).catch(() => null),
    ])
    setSlack(s)
    setClickUp(c)
    setMeetings(f?.meetings ?? [])
    setLoading(false)
    setLastFetched(new Date().toLocaleTimeString())
  }

  useEffect(() => {
    const ctrl = new AbortController()
    fetchAll(ctrl.signal)
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    if (refreshKey === prevKey.current) return
    prevKey.current = refreshKey
    const ctrl = new AbortController()
    fetchAll(ctrl.signal)
    return () => ctrl.abort()
  }, [refreshKey])

  const wr = slack?.weeklyReports
  const filed = wr?.filed ?? []
  const missing = wr?.missing ?? []
  const week = wr?.week ?? '—'
  const slackStats = slack?.slackStats

  // Build full Slack report message
  const fullReportMsg = [
    `📊 *Weekly Roll-Up Report — Week of ${week}*`,
    ``,
    `*TEAM REPORTS*`,
    `Filed: ${filed.length}/${TEAM.length} — ${filed.map(n => n.split(' ')[0]).join(', ') || 'none'}`,
    missing.length ? `Missing: ${missing.map(n => n.split(' ')[0]).join(', ')}` : '✅ All filed',
    ``,
    `*CRM HEALTH*`,
    clickup ? `${clickup.overduePercent}% overdue (${clickup.overdue}/${clickup.totalTasks} tasks) · ${clickup.urgent} urgent` : 'Data unavailable',
    ``,
    `*OKRs*`,
    OKRS.map(o => `${o.id}: ${o.label} — ${o.pct}% (${o.note})`).join('\n'),
    ``,
    `_Posted from Visual Chief of Staff_`,
  ].join('\n')

  return (
    <div>
      <div className="flex items-center justify-between mt-6 mb-1">
        <div className="slbl mb-0">Weekly Roll-Up — {week}</div>
        {lastFetched && <span className="text-xs text-ink4">Updated {lastFetched}</span>}
      </div>

      {/* Executive summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          {
            value: loading ? '…' : `${filed.length}/${TEAM.length}`,
            label: 'Reports Filed',
            sub: loading ? '' : missing.length ? `Missing: ${missing.map(n => n.split(' ')[0]).join(', ')}` : 'All filed ✓',
            alert: !loading && missing.length > 0,
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
            <div className="font-serif font-black text-3xl">{s.value}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink3 mt-0.5">{s.label}</div>
            {s.sub && <div className="text-xs text-ink4 mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Team status roll-up */}
      <Section title="Team Assignment Roll-Up">
        <div className="space-y-2">
          {TEAM.map((name) => {
            const cuKey = TEAM_CU[name] ?? name.split(' ')[0].toLowerCase()
            const stats = clickup?.assigneeStats
              ? Object.entries(clickup.assigneeStats).find(([k]) => k.includes(cuKey))?.[1]
              : null
            const tasks = clickup?.tasksByAssignee
              ? Object.entries(clickup.tasksByAssignee).find(([k]) => k.includes(cuKey))?.[1] ?? []
              : []
            const didFile = filed.includes(name)
            const flow = stats && stats.total > 0
              ? Math.max(5, Math.round(100 - (stats.overdue / stats.total) * 100))
              : null
            return (
              <MemberRollup
                key={name}
                name={name}
                cuKey={cuKey}
                stats={stats ?? null}
                tasks={tasks}
                didFile={didFile}
                flow={flow}
                loading={loading}
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
        <div className="card">
          <div className="card-body overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand3">
                  {['ID', 'Objective', 'Progress', 'Note'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-extrabold uppercase tracking-widest text-ink3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {OKRS.map((o) => (
                  <tr key={o.id} className="border-b border-sand3 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-ink3">{o.id}</td>
                    <td className="px-4 py-2.5 font-bold">{o.label}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-sand3">
                          <div className="h-full bg-black" style={{ width: `${Math.max(o.pct, 2)}%` }} />
                        </div>
                        <span className="font-mono text-xs">{o.pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink3">{o.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* Slack KPIs */}
      {!loading && slackStats && (
        <Section title="Slack Communication KPIs">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Messages This Week', value: slackStats.totalMessages.toLocaleString() },
              { label: 'Active Members', value: slackStats.activeMembers },
              { label: 'Public Channels', value: slackStats.channels },
            ].map((s) => (
              <div key={s.label} className="border border-sand3 p-3">
                <div className="font-serif font-black text-2xl">{s.value}</div>
                <div className="text-xs font-bold uppercase tracking-widest text-ink3 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Fireflies meetings */}
      <Section title={`Meeting Intelligence${meetings.length ? ` (${meetings.length})` : ''}`}>
        {loading ? (
          <div className="border border-sand3 p-4 animate-pulse text-sm text-ink3">Loading meetings…</div>
        ) : meetings.length === 0 ? (
          <div className="border border-sand3 p-4 text-sm text-ink3">
            No recent meetings found in Fireflies.{' '}
            <a href="https://app.fireflies.ai" target="_blank" rel="noopener noreferrer" className="underline">Open Fireflies ↗</a>
          </div>
        ) : (
          <div>
            {meetings.map((m) => <MeetingCard key={m.id} m={m} />)}
            <a
              href="https://app.fireflies.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-xs font-mono border border-black/30 px-2 py-0.5 hover:bg-black hover:text-white transition-colors"
            >
              All meetings in Fireflies ↗
            </a>
          </div>
        )}
      </Section>

      {/* Share bar */}
      {!loading && (
        <div className="flex flex-wrap gap-2 pb-8">
          <ShareSlackButton label="Post Full Report to Slack" message={fullReportMsg} />
          <a
            href="https://app.clickup.com/10643959/home"
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
    </div>
  )
}
