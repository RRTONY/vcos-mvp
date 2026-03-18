'use client'

import { useEffect, useState, useRef } from 'react'
import ProgressBar from '@/components/ProgressBar'
import { useRefresh } from '@/components/RefreshContext'
import { ShareSlackButton } from '@/components/ShareButtons'

interface SlackData {
  weeklyReports?: { filed: string[]; missing: string[]; week: string }
  slackStats?: { totalMessages: number; activeMembers: number; channels: number }
  error?: string
}

interface OverdueTask {
  id: string
  name: string
  list: string
  dueDate: string
  priority: string
  url: string
  assignees: string[]
}

interface ClickUpData {
  totalTasks?: number
  overdue?: number
  overduePercent?: number
  urgent?: number
  completed?: number
  overdueDetails?: OverdueTask[]
  urgentDetails?: OverdueTask[]
  highDetails?: OverdueTask[]
  assigneeStats?: Record<string, { total: number; overdue: number; urgent: number }>
  error?: string
}

function findAssigneeStats(
  assigneeStats: Record<string, { total: number; overdue: number; urgent: number }> | undefined,
  cuName: string
) {
  if (!assigneeStats) return null
  const firstName = cuName.split(' ')[0].toLowerCase()
  const key = Object.keys(assigneeStats).find((k) => k.includes(firstName))
  return key ? assigneeStats[key] : null
}

// ClickUp user IDs mapped to team members (used for deep-link task filters)
// Format: https://app.clickup.com/{teamId}/v/l/everything?assignees={uid}
const FLOW: { name: string; pct: number; note: string; cuName: string }[] = [
  { name: 'Tony', pct: 88, note: 'Vision engine · Protect mornings', cuName: 'Tony Greenberg' },
  { name: 'Kim', pct: 65, note: 'Finance chaos resolved → flow improving', cuName: 'Kim' },
  { name: 'Josh', pct: 72, note: 'Batch legal days Mon/Wed', cuName: 'Josh Bykowski' },
  { name: 'Rob', pct: 55, note: 'Needs 4hr grant blocks', cuName: 'Rob Holmes' },
  { name: 'Alex', pct: 60, note: 'Scope clarity = flow', cuName: 'Alex Veytsel' },
  { name: 'Daniel', pct: 75, note: 'Migration complete · on track', cuName: 'Daniel Baez' },
]

const OKRS = [
  { id: 'OKR01', label: '$5M Revenue', pct: 1, note: '$31K YTD · need $95K/wk' },
  { id: 'OKR02', label: 'Pipeline', pct: 38, note: '30 active deals' },
  { id: 'OKR03', label: 'Action Close Rate', pct: 11, note: '8/75 · target 90%' },
  { id: 'OKR04', label: 'STBL Gatekeepers', pct: 10, note: 'From 23K LinkedIn DB' },
  { id: 'OKR05', label: 'Accounting Fix', pct: 40, note: 'Hiline fired · new search' },
  { id: 'OKR06', label: 'Website Migration', pct: 100, note: 'ramprate.com DONE ✓' },
]

const REFRESH_INTERVAL = 5 * 60 * 1000

function Expandable({ label, count, children, defaultOpen = false }: {
  label: string; count?: number | string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-sand3 mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-sand3/40 transition-colors text-left"
      >
        <span className="text-sm font-bold">{label}</span>
        <span className="flex items-center gap-2">
          {count !== undefined && (
            <span className="text-xs font-mono bg-black text-white px-1.5 py-0.5">{count}</span>
          )}
          <span className="text-ink4 text-xs">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && <div className="border-t border-sand3 px-4 py-3">{children}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const [slack, setSlack] = useState<SlackData | null>(null)
  const [clickup, setClickUp] = useState<ClickUpData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetched, setLastFetched] = useState('')
  const { refreshKey } = useRefresh()
  const prevRefreshKey = useRef(refreshKey)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      setLoading(true)
      const [s, c] = await Promise.all([
        fetch('/api/slack-stats').then((r) => r.json()).catch(() => null),
        fetch('/api/clickup-tasks').then((r) => r.json()).catch(() => null),
      ])
      if (!cancelled) {
        setSlack(s)
        setClickUp(c)
        setLoading(false)
        setLastFetched(new Date().toLocaleTimeString())
      }
    }
    fetchData()
    const id = setInterval(fetchData, REFRESH_INTERVAL)
    return () => { cancelled = true; clearInterval(id) }
  }, []) // initial load only

  // Re-fetch when user presses the topbar ↻ button
  useEffect(() => {
    if (refreshKey === prevRefreshKey.current) return
    prevRefreshKey.current = refreshKey
    let cancelled = false
    async function refetch() {
      setLoading(true)
      const [s, c] = await Promise.all([
        fetch('/api/slack-stats').then((r) => r.json()).catch(() => null),
        fetch('/api/clickup-tasks').then((r) => r.json()).catch(() => null),
      ])
      if (!cancelled) {
        setSlack(s)
        setClickUp(c)
        setLoading(false)
        setLastFetched(new Date().toLocaleTimeString())
      }
    }
    refetch()
    return () => { cancelled = true }
  }, [refreshKey])

  const wr = slack?.weeklyReports
  const filed = wr?.filed ?? []
  const missing = wr?.missing ?? []
  const week = wr?.week ?? '—'
  const slackStats = slack?.slackStats

  // Dynamic alerts — only show after data loaded
  const alerts: { type: 'red' | 'amber' | 'blue'; text: React.ReactNode }[] = []

  if (!loading) {
    if (missing.length > 0) {
      alerts.push({
        type: 'red',
        text: (
          <span className="flex items-center justify-between gap-2 w-full">
            <span><strong>{missing.map((n) => n.split(' ')[0]).join(' + ')}:</strong> Weekly reports not filed. Required by EOD.</span>
            <a href="https://app.slack.com/client/T08K6KLDMJA/C08K6KM53FV" target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">View #weeklyreports ↗</a>
          </span>
        ),
      })
    }
    if ((clickup?.overduePercent ?? 0) > 70) {
      alerts.push({
        type: 'red',
        text: (
          <span className="flex items-center justify-between gap-2 w-full">
            <span><strong>ClickUp CRM:</strong> {clickup?.overdue} of {clickup?.totalTasks} tasks overdue ({clickup?.overduePercent}%). {clickup?.urgent} urgent.</span>
            <a href="https://app.clickup.com/10643959/home" target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">Open ClickUp ↗</a>
          </span>
        ),
      })
    }
    alerts.push({
      type: 'red',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>BILL.com:</strong> 12 sync conflicts + Holographik invoice pending. Kim to resolve today.</span>
          <a href="https://app.bill.com" target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">Open BILL.com ↗</a>
        </span>
      ),
    })
    alerts.push({
      type: 'amber',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>Braintrust template:</strong> 4-point checklist not integrated. Kim due Mar 18.</span>
          <a href="https://app.clickup.com/t/868hwv6u4" target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">Task 868hwv6u4 ↗</a>
        </span>
      ),
    })
    alerts.push({
      type: 'blue',
      text: (
        <span className="flex items-center justify-between gap-2 w-full">
          <span><strong>ImpactSoul legal entity:</strong> No entity = no grants, no Series A. Tony / Kim — this week.</span>
          <a href="https://app.clickup.com/10643959/home" target="_blank" rel="noopener noreferrer" className="underline whitespace-nowrap text-xs">Add to ClickUp ↗</a>
        </span>
      ),
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mt-6 mb-1">
        <div className="slbl mb-0">Command Overview{week !== '—' ? ` — Week of ${week}` : ''}</div>
        {lastFetched && <span className="text-xs text-ink4">Updated {lastFetched}</span>}
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatTile
          value={loading ? '…' : filed.length}
          label="Reports Filed"
          sub={loading ? 'Loading…' : filed.length ? filed.map((n) => n.split(' ')[0]).join(' · ') : 'None yet'}
          loading={loading}
          dark
        />
        <StatTile
          value={loading ? '…' : missing.length}
          label="Missing Reports"
          sub={loading ? 'Loading…' : missing.length ? missing.map((n) => n.split(' ')[0]).join(' · ') : 'All filed ✓'}
          loading={loading}
        />
        <StatTile value="12" label="BILL.com" sub="Sync conflicts" />
        <StatTile
          value={loading ? '…' : `${clickup?.overduePercent ?? '—'}%`}
          label="CRM Overdue"
          sub={clickup && !loading ? `${clickup.overdue}/${clickup.totalTasks} tasks` : 'Loading…'}
          loading={loading}
        />
        <StatTile value="$50K" label="STBL Monthly" sub="Target Apr 30" dark />
        <StatTile
          value={loading ? '…' : slackStats?.activeMembers ?? '—'}
          label="Slack Members"
          sub={loading ? 'Loading…' : `${slackStats?.channels ?? '—'} channels`}
          loading={loading}
          dark
        />
      </div>

      {/* Today's critical items */}
      <div className="slbl">Today&apos;s Critical Items</div>
      {loading ? (
        <div className="alert alert-amber animate-pulse">Fetching live data…</div>
      ) : (
        alerts.map((a, i) => (
          <div key={i} className={`alert alert-${a.type}`}>{a.text}</div>
        ))
      )}

      {/* CRM drill-down */}
      {!loading && clickup && (
        <>
          <div className="slbl">ClickUp Summary</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[
              { label: 'Total Tasks', value: clickup.totalTasks ?? '—' },
              { label: 'Overdue', value: clickup.overdue ?? '—' },
              { label: 'Urgent', value: clickup.urgent ?? '—' },
              { label: 'Completed', value: clickup.completed ?? '—' },
            ].map((s) => (
              <div key={s.label} className="border border-sand3 p-3">
                <div className="font-serif font-black text-2xl">{s.value}</div>
                <div className="text-xs font-bold uppercase tracking-widest text-ink3 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {(clickup.urgentDetails?.length ?? 0) > 0 && (
            <Expandable label="🔴 Urgent Tasks" count={clickup.urgent} defaultOpen>
              <TaskList tasks={clickup.urgentDetails ?? []} />
            </Expandable>
          )}
          {(clickup.overdueDetails?.length ?? 0) > 0 && (
            <Expandable label="Overdue Tasks" count={clickup.overdue}>
              <TaskList tasks={clickup.overdueDetails ?? []} />
            </Expandable>
          )}
        </>
      )}

      {/* Slack drill-down */}
      {!loading && slackStats && (
        <>
          <div className="slbl">Slack Activity</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: 'Messages This Week', value: slackStats.totalMessages },
              { label: 'Active Members', value: slackStats.activeMembers },
              { label: 'Channels', value: slackStats.channels },
            ].map((s) => (
              <div key={s.label} className="border border-sand3 p-3">
                <div className="font-serif font-black text-2xl">{s.value}</div>
                <div className="text-xs font-bold uppercase tracking-widest text-ink3 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {(filed.length > 0 || missing.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <Expandable label="Filed Reports This Week" count={filed.length} defaultOpen={false}>
                {filed.length === 0 ? (
                  <p className="text-xs text-ink3">No reports filed yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {filed.map((name) => (
                      <li key={name} className="flex items-center gap-2 text-sm">
                        <span className="text-green-700 font-bold">✓</span>
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
              </Expandable>
              <Expandable label="Missing Reports" count={missing.length} defaultOpen={missing.length > 0}>
                {missing.length === 0 ? (
                  <p className="text-xs text-green-700 font-bold">All reports filed ✓</p>
                ) : (
                  <ul className="space-y-1">
                    {missing.map((name) => (
                      <li key={name} className="flex items-center gap-2 text-sm">
                        <span className="text-red-600 font-bold">✕</span>
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
              </Expandable>
            </div>
          )}
        </>
      )}

      {/* Share bar */}
      {!loading && (
        <div className="flex flex-wrap gap-2 mb-6">
          <ShareSlackButton
            label="Post Status to Slack"
            message={[
              `📊 *VCOS Status Update — Week of ${week}*`,
              `Reports Filed: ${filed.length} (${filed.map(n => n.split(' ')[0]).join(', ') || 'none'})`,
              missing.length ? `Missing: ${missing.map(n => n.split(' ')[0]).join(', ')}` : 'All reports filed ✅',
              clickup ? `CRM: ${clickup.overduePercent}% overdue (${clickup.overdue}/${clickup.totalTasks} tasks)` : '',
              `BILL.com: 12 sync conflicts unresolved`,
              `_Posted from Visual Chief of Staff_`,
            ].filter(Boolean).join('\n')}
          />
          <a
            href="https://app.clickup.com/10643959/home"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-sand3 px-3 py-1.5 text-xs font-bold hover:bg-sand2 transition-colors"
          >
            Open ClickUp ↗
          </a>
        </div>
      )}

      <div className="slbl">Team Flow This Week</div>
      <div className="card">
        <div className="card-body">
          {FLOW.map((f) => {
            const allTasks = [...(clickup?.overdueDetails ?? []), ...(clickup?.urgentDetails ?? [])]
            const memberTasks = allTasks.filter((t) =>
              t.assignees.some((a) => a.toLowerCase().includes(f.cuName.split(' ')[0].toLowerCase()))
            )
            // dedupe by id
            const seen = new Set<string>()
            const uniqueTasks = memberTasks.filter((t) => seen.has(t.id) ? false : (seen.add(t.id), true))
            const stats = findAssigneeStats(clickup?.assigneeStats, f.cuName)
            const dynPct = stats && stats.total > 0 ? Math.max(5, Math.round(100 - (stats.overdue / stats.total) * 100)) : f.pct
            const dynNote = stats ? `${stats.total} tasks · ${stats.overdue} overdue · ${stats.urgent} urgent` : f.note
            return (
              <div key={f.name} className="mb-4">
                <ProgressBar
                  label={f.name}
                  pct={dynPct}
                  note={dynNote}
                  href={`https://app.clickup.com/10643959/home`}
                />
                {!loading && uniqueTasks.length > 0 && (
                  <div className="mt-1 mb-2 ml-1 space-y-1">
                    {uniqueTasks.slice(0, 5).map((t) => (
                      <a
                        key={t.id}
                        href={t.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-ink3 hover:text-black group"
                      >
                        <span className={t.priority === 'urgent' ? 'text-red-500' : 'text-ink4'}>▸</span>
                        <span className="group-hover:underline truncate">{t.name}</span>
                        {t.dueDate && <span className="text-ink4 flex-shrink-0">· {t.dueDate}</span>}
                      </a>
                    ))}
                    {uniqueTasks.length > 5 && (
                      <a href="https://app.clickup.com/10643959/home" target="_blank" rel="noopener noreferrer" className="text-xs text-ink4 hover:underline">
                        +{uniqueTasks.length - 5} more in ClickUp ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="slbl">OKR Pulse</div>
      <div className="card">
        <div className="card-body">
          {OKRS.map((o) => (
            <ProgressBar key={o.id} id={o.id} label={o.label} pct={o.pct} note={o.note} />
          ))}
        </div>
      </div>
    </div>
  )
}

function TaskList({ tasks }: { tasks: OverdueTask[] }) {
  return (
    <div className="space-y-0">
      {tasks.map((t) => (
        <a
          key={t.id}
          href={t.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 py-2 border-b border-sand3 last:border-0 hover:bg-sand3/30 -mx-4 px-4 transition-colors group"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium group-hover:underline">{t.name}</div>
            <div className="text-xs text-ink3 mt-0.5">
              {t.list}{t.dueDate ? ` · Due ${t.dueDate}` : ''}{t.assignees.length ? ` · ${t.assignees.join(', ')}` : ''}
            </div>
          </div>
          {t.priority && <span className="text-xs font-mono text-ink3 flex-shrink-0 capitalize">{t.priority}</span>}
          <span className="text-ink4 text-xs flex-shrink-0">↗</span>
        </a>
      ))}
      <a
        href="https://app.clickup.com/10643959/home"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block mt-3 text-xs font-mono border border-black/30 px-2 py-0.5 hover:bg-black hover:text-white transition-colors"
      >
        Open all in ClickUp ↗
      </a>
    </div>
  )
}

// Inline stat tile
function StatTile({ value, label, sub, loading = false, dark = false }: {
  value: string | number
  label: string
  sub?: string
  loading?: boolean
  dark?: boolean
}) {
  return (
    <div className={`border border-sand3 p-3 ${loading ? 'animate-pulse' : ''} ${dark ? 'bg-black text-white' : ''}`}>
      <div className={`font-serif font-black text-3xl ${dark ? 'text-white' : ''}`}>{value}</div>
      <div className={`text-xs font-bold uppercase tracking-widest mt-0.5 ${dark ? 'text-white/60' : 'text-ink3'}`}>{label}</div>
      {sub && <div className={`text-xs mt-0.5 ${dark ? 'text-white/40' : 'text-ink4'}`}>{sub}</div>}
    </div>
  )
}
