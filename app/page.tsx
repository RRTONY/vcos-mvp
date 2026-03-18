'use client'

import { useEffect, useState, useCallback } from 'react'
import StatBox from '@/components/StatBox'
import ProgressBar from '@/components/ProgressBar'
import { useRefresh } from '@/components/RefreshContext'
import { ShareSlackButton } from '@/components/ShareButtons'

interface SlackData {
  weeklyReports?: { filed: string[]; missing: string[]; week: string }
  slackStats?: { totalMessages: number; activeMembers: number; channels: number }
  error?: string
}

interface ClickUpData {
  totalTasks?: number
  overdue?: number
  overduePercent?: number
  urgent?: number
  completed?: number
  error?: string
}

const FLOW = [
  { name: 'Tony', pct: 88, note: 'Vision engine · Protect mornings' },
  { name: 'Kim', pct: 65, note: 'Finance chaos resolved → flow improving' },
  { name: 'Josh', pct: 72, note: 'Batch legal days Mon/Wed' },
  { name: 'Rob', pct: 55, note: 'Needs 4hr grant blocks' },
  { name: 'Alex', pct: 60, note: 'Scope clarity = flow' },
  { name: 'Daniel', pct: 75, note: 'Migration complete · on track' },
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

export default function DashboardPage() {
  const [slack, setSlack] = useState<SlackData | null>(null)
  const [clickup, setClickUp] = useState<ClickUpData | null>(null)
  const [loading, setLoading] = useState(true)
  const { refreshKey, triggerRefresh } = useRefresh()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [s, c] = await Promise.all([
      fetch('/api/slack-stats').then((r) => r.json()).catch(() => null),
      fetch('/api/clickup-tasks').then((r) => r.json()).catch(() => null),
    ])
    setSlack(s)
    setClickUp(c)
    setLoading(false)
    triggerRefresh()
  }, [triggerRefresh])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchData, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const wr = slack?.weeklyReports
  const filed = wr?.filed ?? []
  const missing = wr?.missing ?? []
  const week = wr?.week ?? '—'
  const slackStats = slack?.slackStats

  // Dynamic alerts
  const alerts: { type: 'red' | 'amber' | 'blue'; text: React.ReactNode }[] = []

  if (missing.length > 0 && !loading) {
    alerts.push({
      type: 'red',
      text: (
        <>
          <strong>{missing.map((n) => n.split(' ')[0]).join(' + ')}:</strong> Weekly reports not filed.
          Required by EOD.
        </>
      ),
    })
  }

  if ((clickup?.overduePercent ?? 0) > 70 && !loading) {
    alerts.push({
      type: 'red',
      text: (
        <>
          <strong>ClickUp CRM:</strong> {clickup?.overdue} of {clickup?.totalTasks} tasks overdue
          ({clickup?.overduePercent}%). {clickup?.urgent} urgent items need triage.
        </>
      ),
    })
  }

  alerts.push({
    type: 'red',
    text: (
      <>
        <strong>BILL.com:</strong> 12 sync conflicts + Holographik invoice pending. Kim to resolve today.
      </>
    ),
  })

  alerts.push({
    type: 'amber',
    text: (
      <>
        <strong>Braintrust template:</strong> 4-point checklist not integrated. Kim due Mar 18.{' '}
        <a href="https://app.clickup.com/t/868hwv6u4" target="_blank" className="underline">
          Task 868hwv6u4
        </a>
      </>
    ),
  })

  alerts.push({
    type: 'blue',
    text: (
      <>
        <strong>ImpactSoul legal entity:</strong> No entity = no grants, no Series A. Tony / Kim — this week.
      </>
    ),
  })

  return (
    <div>
      <div className="slbl mt-6">
        Command Overview{week !== '—' ? ` — Week of ${week}` : ''}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <StatBox
          value={loading ? '—' : filed.length}
          label="Reports Filed"
          sub={
            loading ? '…'
            : filed.length
            ? filed.map((n) => n.split(' ')[0]).join(' · ')
            : 'None yet'
          }
          shade="black"
          loading={loading}
        />
        <StatBox
          value={loading ? '—' : missing.length}
          label="Missing"
          sub={
            loading ? '…'
            : missing.length
            ? missing.map((n) => n.split(' ')[0]).join(' · ')
            : 'All filed ✓'
          }
          shade="gray"
          loading={loading}
        />
        <StatBox value="12" label="BILL.com" sub="Sync conflicts" shade="gray" />
        <StatBox
          value={loading ? '—' : `${clickup?.overduePercent ?? '—'}%`}
          label="CRM Overdue"
          sub={clickup && !loading ? `${clickup.overdue}/${clickup.totalTasks} tasks` : '…'}
          shade="gray"
          loading={loading}
        />
        <StatBox value="$50K" label="STBL Monthly" sub="Target Apr 30" shade="black" />
        <StatBox
          value={loading ? '—' : slackStats?.activeMembers ?? '—'}
          label="Slack Members"
          sub={loading ? '…' : `${slackStats?.channels ?? '—'} channels`}
          shade="black"
          loading={loading}
        />
      </div>

      <div className="slbl">Today&apos;s Critical Items</div>
      {loading ? (
        <div className="alert alert-amber animate-pulse">Loading live data…</div>
      ) : (
        alerts.map((a, i) => (
          <div key={i} className={`alert alert-${a.type}`}>{a.text}</div>
        ))
      )}

      <div className="slbl">ClickUp Summary</div>
      {clickup && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
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
      )}

      <div className="slbl">Slack Activity</div>
      {slackStats && !loading && (
        <div className="grid grid-cols-3 gap-3 mb-6">
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
          {FLOW.map((f) => (
            <ProgressBar key={f.name} label={f.name} pct={f.pct} note={f.note} />
          ))}
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
