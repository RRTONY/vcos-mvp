'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import Avatar from '@/components/Avatar'
import Spinner from '@/components/Spinner'
import type { ClickUpData, WebWorkMember } from '@/lib/types'

interface TeamRow { full_name: string; clickup_key: string | null; role_description: string | null; active: boolean }

function lookup<T>(map: Record<string, T> | undefined, key: string): T | null {
  if (!map || !key) return null
  const k = Object.keys(map).find(x => x.includes(key))
  return k ? map[k] : null
}

interface Row {
  name: string; role: string; key: string
  total: number; overdue: number; urgent: number; hours: number | null
  avatar: { image: string | null; initials: string | null; color: string | null } | null
}

export default function WorkloadPage() {
  const { refreshKey } = useRefresh()
  const [clickup, setClickUp] = useState<ClickUpData | null>(null)
  const [team, setTeam] = useState<TeamRow[]>([])
  const [webwork, setWebwork] = useState<WebWorkMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/clickup-tasks', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/team', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
      fetch('/api/webwork', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ]).then(([cu, t, ww]) => {
      setClickUp(cu)
      setTeam(Array.isArray(t) ? t.filter((m: TeamRow) => m.active) : [])
      setWebwork(ww?.members ?? [])
      setLoading(false)
    })
  }, [refreshKey])

  const rows: Row[] = useMemo(() => {
    if (!clickup?.assigneeStats) return []
    return team.map(m => {
      const key = (m.clickup_key ?? m.full_name.split(' ')[0]).toLowerCase()
      const s = lookup(clickup.assigneeStats, key)
      const w = webwork.find(x => { const u = x.username.toLowerCase(); return key && (u.includes(key) || key.includes(u)) })
      return {
        name: m.full_name, role: m.role_description ?? '', key,
        total: s?.total ?? 0, overdue: s?.overdue ?? 0, urgent: s?.urgent ?? 0,
        hours: w?.totalHours ?? null,
        avatar: lookup(clickup.assigneeAvatars, key),
      }
    }).filter(r => r.total > 0 || r.hours).sort((a, b) => b.total - a.total)
  }, [clickup, team, webwork])

  const max = Math.max(1, ...rows.map(r => r.total))
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.total, 0) / rows.length) : 0

  // Load band relative to team average.
  const band = (total: number): { label: string; cls: string } => {
    if (avg === 0) return { label: '', cls: '' }
    if (total >= avg * 1.5) return { label: 'Overloaded', cls: 'badge-red' }
    if (total <= avg * 0.5) return { label: 'Light', cls: 'badge' }
    return { label: 'Balanced', cls: 'badge-green' }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-xl tracking-widest">WORKLOAD BALANCING</h1>
        {!loading && rows.length > 0 && <span className="text-xs text-ink4">Team avg <strong className="text-ink">{avg}</strong> open tasks/person</span>}
      </div>
      <p className="text-xs text-ink4 mb-4">Open ClickUp task load per person, relative to the team average — spot who&apos;s overloaded vs. who has capacity.</p>

      {loading ? <div className="py-6"><Spinner label="Loading workload…" className="text-ink4 text-sm" /></div>
        : rows.length === 0 ? <div className="card p-6 text-center text-sm text-ink4">No task data available.</div>
        : (
          <div className="card divide-y divide-sand3">
            {rows.map(r => {
              const b = band(r.total)
              const barColor = b.label === 'Overloaded' ? 'bg-danger' : b.label === 'Light' ? 'bg-sand4' : 'bg-accent'
              return (
                <div key={r.name} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} image={r.avatar?.image} initials={r.avatar?.initials} color={r.avatar?.color} className="w-8 h-8 text-xs" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{r.name}</span>
                        {b.label && <span className={`${b.cls} flex-shrink-0`}>{b.label}</span>}
                      </div>
                      <div className="text-[11px] text-ink4">{r.role}</div>
                    </div>
                    <div className="text-right flex-shrink-0 text-xs">
                      <div className="text-sm font-bold tabular-nums">{r.total} <span className="font-normal text-ink4">tasks</span></div>
                      <div className="text-ink4">
                        {r.overdue > 0 && <span className="text-danger font-semibold">{r.overdue} overdue</span>}
                        {r.overdue > 0 && r.urgent > 0 && ' · '}
                        {r.urgent > 0 && <span className="text-warning font-semibold">{r.urgent} urgent</span>}
                        {r.hours != null && <span> · {r.hours}h</span>}
                      </div>
                    </div>
                  </div>
                  <div className="progress-track mt-2">
                    <div className={`progress-fill ${barColor}`} style={{ width: `${Math.round((r.total / max) * 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
