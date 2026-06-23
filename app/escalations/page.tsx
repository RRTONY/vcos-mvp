'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import Spinner from '@/components/Spinner'
import { ShareSlackButton } from '@/components/ShareButtons'
import { reportState } from '@/lib/report-status'
import { DEAL_COLD_DAYS } from '@/lib/constants'
import type { ClickUpData, Task } from '@/lib/types'

type Sev = 'critical' | 'high' | 'watch'
interface Escalation { sev: Sev; kind: string; title: string; detail: string; url?: string }

interface TeamRow { full_name: string; files_report: boolean; active: boolean }
interface ReportRow { submitted_by: string; created_at: string }
interface Commitment { text: string; owner: string | null; due: string | null; status: 'open' | 'done' }
interface BdDeal { company: string; stage: string; last_contact: string | null; owner: string; next_action: string }

const SEV_META: Record<Sev, { label: string; badge: string; dot: string; rank: number }> = {
  critical: { label: 'Critical', badge: 'badge-red', dot: 'bg-danger', rank: 0 },
  high: { label: 'High', badge: 'badge-amber', dot: 'bg-warning', rank: 1 },
  watch: { label: 'Watch', badge: 'badge', dot: 'bg-ink4', rank: 2 },
}

function mostRecentMonday(from: Date): Date {
  const d = new Date(from); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d
}
const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)

export default function EscalationsPage() {
  const { refreshKey } = useRefresh()
  const [clickup, setClickUp] = useState<ClickUpData | null>(null)
  const [team, setTeam] = useState<TeamRow[]>([])
  const [reports, setReports] = useState<ReportRow[]>([])
  const [commits, setCommits] = useState<Commitment[]>([])
  const [deals, setDeals] = useState<BdDeal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const monday = mostRecentMonday(new Date()).toISOString().slice(0, 10)
    Promise.all([
      fetch('/api/clickup-tasks', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/team', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
      fetch(`/api/weekly-reports?week_start=${monday}`, { cache: 'no-store' }).then(r => r.json()).catch(() => []),
      fetch('/api/commitments', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ items: [] })),
      fetch('/api/bd', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    ]).then(([cu, t, rep, com, bd]) => {
      setClickUp(cu)
      setTeam(Array.isArray(t) ? t.filter((m: TeamRow) => m.active) : [])
      setReports(Array.isArray(rep) ? rep : [])
      setCommits(Array.isArray(com?.items) ? com.items : [])
      setDeals(Array.isArray(bd) ? bd : (Array.isArray(bd?.deals) ? bd.deals : []))
      setLoading(false)
    })
  }, [refreshKey])

  const escalations: Escalation[] = useMemo(() => {
    const out: Escalation[] = []
    const now = new Date()
    const monday = mostRecentMonday(now)
    const today = now.toISOString().slice(0, 10)

    // 1. Urgent tasks that are overdue → critical
    const overdue = (clickup?.overdueDetails ?? []) as Task[]
    for (const t of overdue.filter(t => t.priority === 'urgent').slice(0, 25)) {
      out.push({ sev: 'critical', kind: 'Task', title: t.name, detail: `Urgent & overdue${t.dueDate ? ` · was due ${t.dueDate}` : ''} · ${t.list}`, url: t.url })
    }

    // 2. Reports not submitted (Friday passed) → high
    for (const m of team.filter(m => m.files_report)) {
      const rep = reports.find(r => r.submitted_by && r.submitted_by.toLowerCase().includes(m.full_name.split(' ')[0].toLowerCase()))
      if (reportState(monday, rep?.created_at ?? null, now) === 'missing') {
        out.push({ sev: 'high', kind: 'Report', title: `${m.full_name} — weekly report not submitted`, detail: 'Friday deadline passed' })
      }
    }

    // 3. Overdue commitments → high
    for (const c of commits.filter(c => c.status === 'open' && c.due && c.due < today)) {
      out.push({ sev: 'high', kind: 'Commitment', title: c.text, detail: `Overdue${c.owner ? ` · ${c.owner}` : ''} · was due ${c.due}` })
    }

    // 4. Cold deals → watch
    for (const d of deals) {
      if (d.last_contact && daysSince(d.last_contact) >= DEAL_COLD_DAYS) {
        out.push({ sev: 'watch', kind: 'Deal', title: `${d.company} — gone cold`, detail: `No contact in ${daysSince(d.last_contact)}d · ${d.stage}${d.next_action ? ` · next: ${d.next_action}` : ''}` })
      }
    }
    return out.sort((a, b) => SEV_META[a.sev].rank - SEV_META[b.sev].rank)
  }, [clickup, team, reports, commits, deals])

  const counts = {
    critical: escalations.filter(e => e.sev === 'critical').length,
    high: escalations.filter(e => e.sev === 'high').length,
    watch: escalations.filter(e => e.sev === 'watch').length,
  }

  const slackMsg = useMemo(() => {
    if (!escalations.length) return '✅ No active escalations — all clear.'
    const lines = ['🚨 *VCoS-AI — Escalations*', '']
    for (const s of ['critical', 'high', 'watch'] as Sev[]) {
      const items = escalations.filter(e => e.sev === s)
      if (!items.length) continue
      lines.push(`*${SEV_META[s].label}* (${items.length})`)
      items.slice(0, 12).forEach(e => lines.push(`• [${e.kind}] ${e.title}`))
      lines.push('')
    }
    return lines.join('\n')
  }, [escalations])

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-1 gap-3">
        <h1 className="font-display text-xl tracking-widest">ESCALATIONS</h1>
        <div className="flex items-center gap-2">
          {counts.critical > 0 && <span className="badge-red">{counts.critical} critical</span>}
          {!loading && <ShareSlackButton label="Post to Slack" message={slackMsg} />}
        </div>
      </div>
      <p className="text-xs text-ink4 mb-4">Everything that needs attention right now — overdue urgent tasks, missed reports, overdue commitments, and cold deals — ranked by severity.</p>

      {loading ? <div className="py-6"><Spinner label="Scanning…" className="text-ink4 text-sm" /></div>
        : escalations.length === 0 ? <div className="alert alert-green">✓ No active escalations — everything is on track.</div>
        : (
          <div className="card divide-y divide-sand3">
            {escalations.map((e, i) => {
              const meta = SEV_META[e.sev]
              const body = (
                <div className="flex items-start gap-3 px-4 py-3">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink">{e.title}</div>
                    <div className="text-[11px] text-ink4 mt-0.5">{e.detail}</div>
                  </div>
                  <span className={`${meta.badge} flex-shrink-0`}>{e.kind}</span>
                </div>
              )
              return e.url
                ? <a key={i} href={e.url} target="_blank" rel="noopener noreferrer" className="block hover:bg-sand2 transition-colors">{body}</a>
                : <div key={i}>{body}</div>
            })}
          </div>
        )}
    </div>
  )
}
