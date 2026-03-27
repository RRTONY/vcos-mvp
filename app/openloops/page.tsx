'use client'

import { useState, useEffect } from 'react'
import { useRefresh } from '@/components/RefreshContext'

// ─── Types ──────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'high' | 'info'

interface Loop {
  id: string
  severity: Severity
  category: string
  text: string
  sub?: string
  url?: string
  assignees?: string[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'border-l-red-600 bg-red-50/30',
  high:     'border-l-amber-500',
  info:     'border-l-blue-400',
}

const SEVERITY_BADGE: Record<Severity, string> = {
  critical: 'bg-black text-white',
  high:     'bg-amber-100 text-amber-800',
  info:     'bg-blue-50 text-blue-700',
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'CRITICAL',
  high:     'HIGH',
  info:     'INFO',
}

const CATEGORY_ORDER = ['Reports', 'CRM Tasks', 'BD Pipeline', 'Invoices', 'Systems']

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function OpenLoopsPage() {
  const [loops, setLoops] = useState<Loop[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const { refreshKey } = useRefresh()

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    Promise.all([
      fetch('/api/clickup-tasks', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/slack-stats',   { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/bd',            { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/invoices',      { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ]).then(([cu, slack, bd, inv]) => {
      if (cancelled) return
      const found: Loop[] = []

      // ── Reports: missing weekly reports ─────────────────────────────────
      const missing: string[] = slack?.weeklyReports?.missing ?? []
      if (missing.length > 0) {
        found.push({
          id: 'reports-missing',
          severity: 'critical',
          category: 'Reports',
          text: `${missing.length} team member${missing.length > 1 ? 's' : ''} have not filed this week`,
          sub: missing.map((n: string) => n.split(' ')[0]).join(', '),
          url: 'https://app.slack.com/client/T08K6KLDMJA/C08K6KM53FV',
        })
      }

      // ── CRM Tasks: urgent ───────────────────────────────────────────────
      const urgentTasks = cu?.urgentDetails ?? []
      for (const t of urgentTasks.slice(0, 10)) {
        found.push({
          id: `cu-urgent-${t.id}`,
          severity: 'critical',
          category: 'CRM Tasks',
          text: t.name,
          sub: `${t.list}${t.dueDate ? ` · Due ${t.dueDate}` : ''}`,
          url: t.url,
          assignees: t.assignees,
        })
      }

      // ── CRM Tasks: high priority ─────────────────────────────────────────
      const highTasks = cu?.highDetails ?? []
      for (const t of highTasks.slice(0, 8)) {
        found.push({
          id: `cu-high-${t.id}`,
          severity: 'high',
          category: 'CRM Tasks',
          text: t.name,
          sub: `${t.list}${t.dueDate ? ` · Due ${t.dueDate}` : ''}`,
          url: t.url,
          assignees: t.assignees,
        })
      }

      // ── CRM Tasks: overdue % alert ───────────────────────────────────────
      if ((cu?.overduePercent ?? 0) > 70) {
        found.push({
          id: 'cu-overdue-pct',
          severity: 'critical',
          category: 'CRM Tasks',
          text: `${cu.overduePercent}% of ClickUp tasks are overdue (${cu.overdue}/${cu.totalTasks})`,
          sub: 'CRM needs triage — too many stale tasks',
          url: 'https://app.clickup.com/10643959/home',
        })
      }

      // ── BD Pipeline: deals with no next action ───────────────────────────
      const deals: Array<{
        id: string; company: string; stage: string
        next_action: string; last_contact: string | null
        entered_stage_at: string | null; owner: string
      }> = bd?.deals ?? []

      const today = Date.now()

      const noAction = deals.filter(d => d.stage !== 'Deferred' && !d.next_action)
      if (noAction.length > 0) {
        found.push({
          id: 'bd-no-action',
          severity: 'high',
          category: 'BD Pipeline',
          text: `${noAction.length} deal${noAction.length > 1 ? 's' : ''} have no next action defined`,
          sub: noAction.map(d => d.company).join(', '),
          url: '/bd',
        })
      }

      // Deals gone cold (no contact 14d+)
      const cold = deals.filter(d => {
        if (d.stage === 'Deferred') return false
        if (!d.last_contact) return false
        return (today - new Date(d.last_contact).getTime()) / 86400000 > 14
      })
      if (cold.length > 0) {
        found.push({
          id: 'bd-cold',
          severity: 'high',
          category: 'BD Pipeline',
          text: `${cold.length} deal${cold.length > 1 ? 's' : ''} have gone cold (no contact 14d+)`,
          sub: cold.map(d => d.company).join(', '),
          url: '/bd',
        })
      }

      // Deals stuck in same stage 21d+
      const stuck = deals.filter(d => {
        if (d.stage === 'Deferred' || !d.entered_stage_at) return false
        return (today - new Date(d.entered_stage_at).getTime()) / 86400000 > 21
      })
      if (stuck.length > 0) {
        found.push({
          id: 'bd-stuck',
          severity: 'high',
          category: 'BD Pipeline',
          text: `${stuck.length} deal${stuck.length > 1 ? 's' : ''} stuck in same stage for 21+ days`,
          sub: stuck.map(d => `${d.company} (${d.stage})`).join(', '),
          url: '/bd',
        })
      }

      // ── Invoices: pending ────────────────────────────────────────────────
      const invoices: Array<{ id: string; contractor: string; status: string; parsedAt: string }> =
        inv?.invoices ?? []

      const pending = invoices.filter(i => i.status === 'pending')
      if (pending.length > 0) {
        found.push({
          id: 'inv-pending',
          severity: 'high',
          category: 'Invoices',
          text: `${pending.length} Braintrust invoice${pending.length > 1 ? 's' : ''} pending approval`,
          sub: pending.map(i => i.contractor).join(', '),
          url: '/invoices',
        })
      }

      // Invoices older than 7 days still pending
      const oldPending = pending.filter(i => {
        if (!i.parsedAt) return false
        return (today - new Date(i.parsedAt).getTime()) / 86400000 > 7
      })
      if (oldPending.length > 0) {
        found.push({
          id: 'inv-old-pending',
          severity: 'critical',
          category: 'Invoices',
          text: `${oldPending.length} invoice${oldPending.length > 1 ? 's' : ''} pending for 7+ days`,
          sub: oldPending.map(i => i.contractor).join(', '),
          url: '/invoices',
        })
      }

      setLoops(found)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [refreshKey])

  function dismiss(id: string) {
    setDismissed(prev => new Set([...prev, id]))
  }

  const open = loops.filter(l => !dismissed.has(l.id))
  const byCategory = groupBy(open, l => l.category)
  const orderedCategories = [
    ...CATEGORY_ORDER.filter(c => byCategory[c]),
    ...Object.keys(byCategory).filter(c => !CATEGORY_ORDER.includes(c)),
  ]

  const criticalCount = open.filter(l => l.severity === 'critical').length
  const highCount     = open.filter(l => l.severity === 'high').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mt-6 mb-4">
        <h1 className="font-display text-xl tracking-widest">OPEN LOOPS</h1>
        {!loading && open.length > 0 && (
          <div className="flex gap-2 text-xs">
            {criticalCount > 0 && (
              <span className="font-bold text-red-600">{criticalCount} critical</span>
            )}
            {highCount > 0 && (
              <span className="font-bold text-amber-600">{highCount} high</span>
            )}
          </div>
        )}
      </div>

      {/* Status banner */}
      {loading ? (
        <div className="border border-sand3 p-4 text-sm text-ink4 animate-pulse mb-4">
          Checking all systems…
        </div>
      ) : open.length === 0 ? (
        <div className="border border-green-300 bg-green-50 p-4 text-sm font-bold text-green-800 mb-4">
          ✓ No open loops — all systems clear
        </div>
      ) : null}

      {/* Loops grouped by category */}
      {!loading && orderedCategories.map(category => (
        <div key={category} className="mb-6">
          <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-2 flex items-center gap-2">
            {category}
            <span className="font-normal text-ink4">({byCategory[category].length})</span>
          </div>
          <div className="space-y-2">
            {byCategory[category].map(loop => (
              <div
                key={loop.id}
                className={`border border-l-4 ${SEVERITY_STYLE[loop.severity]} bg-sand`}
              >
                <div className="p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 ${SEVERITY_BADGE[loop.severity]}`}>
                        {SEVERITY_LABEL[loop.severity]}
                      </span>
                      {loop.assignees && loop.assignees.length > 0 && (
                        <span className="text-xs text-ink3 font-medium">
                          {loop.assignees.join(' · ')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium leading-snug">{loop.text}</p>
                    {loop.sub && (
                      <p className="text-xs text-ink3 mt-0.5 leading-snug">{loop.sub}</p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {loop.url && (
                      <a
                        href={loop.url}
                        target={loop.url.startsWith('http') ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className="border border-sand3 px-2 py-1 text-[10px] font-bold hover:bg-sand2 transition-colors whitespace-nowrap"
                      >
                        Open ↗
                      </a>
                    )}
                    <button
                      onClick={() => dismiss(loop.id)}
                      className="border border-sand3 px-2 py-1 text-[10px] hover:bg-sand2 transition-colors text-ink4"
                      title="Dismiss for this session"
                    >
                      ✓
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Dismissed */}
      {dismissed.size > 0 && (
        <div className="mt-6">
          <div className="text-xs text-ink4 mb-2">
            {dismissed.size} dismissed this session —{' '}
            <button onClick={() => setDismissed(new Set())} className="underline hover:text-ink">
              restore all
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
