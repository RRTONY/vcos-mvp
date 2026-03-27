'use client'

import { useEffect, useState } from 'react'
import { useMe } from '@/hooks/useMe'
import { REPORT_MEMBERS } from '@/lib/team'

// ─── Types ─────────────────────────────────────────────────────────────────

interface BdDeal {
  id: string
  company: string
  stage: string
  score: number
  // legacy text fields
  year1: string
  ramprate_cut: string
  speed_to_close: string
  impactsoul: string
  probability: string
  structure: string
  notes: string
  // new CRM fields
  contact_name: string
  contact_title: string
  next_action: string
  next_action_by: string
  last_contact: string | null       // date string YYYY-MM-DD
  entered_stage_at: string | null   // date string YYYY-MM-DD
  year1_value: number | null
  probability_pct: number | null
  owner: string
  source: string
}

interface Activity {
  id: string
  deal_id: string
  created_at: string
  type: 'Call' | 'Email' | 'Meeting' | 'Note' | 'Stage Change'
  summary: string
  by: string | null
}

interface PipelineMetrics {
  weightedPipeline: number
  totalPipeline: number
  totalDeals: number
  goneCold: number
  stuck: number
}

interface KpiData {
  teamHours: number
  memberHours: { username: string; totalHours: number }[]
  reportsFiled: number
  reportsTotal: number
  reportsMissing: string[]
  totalTasks: number
  overdue: number
  overduePercent: number
  urgent: number
  invoiceCount: number
  invoicePending: number
}

const STAGE_COLOR: Record<string, string> = {
  Active:   'bg-black text-white',
  Warm:     'bg-amber-100 text-amber-800',
  Cold:     'bg-blue-50 text-blue-700',
  Deferred: 'bg-sand2 text-ink3',
}

const STAGE_BORDER: Record<string, string> = {
  Active:   'border-black/20',
  Warm:     'border-amber-200',
  Cold:     'border-blue-200',
  Deferred: 'border-sand3',
}

const STAGES = ['Active', 'Warm', 'Cold', 'Deferred']

const EMPTY_DEAL: Omit<BdDeal, 'id'> = {
  company: '', stage: 'Warm', score: 50,
  year1: '', ramprate_cut: '', speed_to_close: '',
  impactsoul: '', probability: '', structure: '', notes: '',
  contact_name: '', contact_title: '', next_action: '', next_action_by: '',
  last_contact: null, entered_stage_at: null,
  year1_value: null, probability_pct: null, owner: '', source: '',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function DaysChip({ days, warnAfter, alertAfter }: { days: number | null; warnAfter: number; alertAfter: number }) {
  if (days === null) return null
  const color = days >= alertAfter ? 'text-red-600 font-bold' : days >= warnAfter ? 'text-amber-600' : 'text-ink4'
  return <span className={`text-[11px] ${color}`}>{days}d</span>
}

// ─── Activity Log ───────────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, string> = {
  Call: '📞', Email: '📧', Meeting: '🤝', Note: '📝', 'Stage Change': '→',
}

function ActivityLog({ dealId, canAdd }: { dealId: string; canAdd: boolean }) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<Activity['type']>('Note')
  const [summary, setSummary] = useState('')
  const [by, setBy] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/bd/activity?deal_id=${dealId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setActivities(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [dealId])

  async function submit() {
    if (!summary.trim()) return
    setSaving(true)
    const res = await fetch('/api/bd/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId, type, summary: summary.trim(), by: by || null }),
    })
    if (res.ok) {
      const created = await res.json()
      setActivities(prev => [created, ...prev])
      setSummary('')
      setShowForm(false)
    }
    setSaving(false)
  }

  function relativeTime(iso: string) {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 60)    return `${mins}m ago`
    if (mins < 1440)  return `${Math.floor(mins / 60)}h ago`
    return `${Math.floor(mins / 1440)}d ago`
  }

  return (
    <div className="border-t border-sand3 mt-2 pt-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-ink4">
          Activity {activities.length > 0 && `(${activities.length})`}
        </span>
        {canAdd && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-[10px] text-ink4 hover:text-ink underline"
          >
            + Log
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="space-y-1.5 bg-sand2 p-2 border border-sand3">
          <div className="flex gap-1 flex-wrap">
            {(['Call','Email','Meeting','Note'] as Activity['type'][]).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`text-[10px] px-1.5 py-0.5 border transition-colors ${type === t ? 'bg-black text-white border-black' : 'border-sand3 text-ink3 hover:border-ink3'}`}
              >
                {ACTIVITY_ICONS[t]} {t}
              </button>
            ))}
          </div>
          <textarea
            className="w-full border border-sand3 bg-sand px-2 py-1 text-xs resize-none focus:outline-none focus:border-ink"
            rows={2}
            placeholder="What happened?"
            value={summary}
            onChange={e => setSummary(e.target.value)}
            autoFocus
          />
          <input
            className="w-full border border-sand3 bg-sand px-2 py-1 text-xs focus:outline-none focus:border-ink"
            placeholder="Your name (optional)"
            value={by}
            onChange={e => setBy(e.target.value)}
          />
          <div className="flex gap-1">
            <button
              onClick={submit}
              disabled={saving || !summary.trim()}
              className="btn-primary text-[10px] py-0.5 px-2 disabled:opacity-40"
            >
              {saving ? '…' : 'Save'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-[10px] text-ink4 hover:text-ink underline px-1">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Log entries */}
      {loading ? (
        <div className="text-[10px] text-ink4 animate-pulse">Loading…</div>
      ) : activities.length === 0 ? (
        <div className="text-[10px] text-ink4">No activity yet.</div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {activities.map(a => (
            <div key={a.id} className="flex gap-1.5 text-[11px]">
              <span className="flex-shrink-0 mt-0.5">{ACTIVITY_ICONS[a.type]}</span>
              <div className="flex-1 min-w-0">
                <span className="text-ink leading-snug">{a.summary}</span>
                <div className="text-ink4 mt-0.5">
                  {a.by && <span>{a.by} · </span>}
                  {relativeTime(a.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Deal Card (Kanban) ─────────────────────────────────────────────────────

function DealCard({
  deal, isAdmin, onStageChange, onEdit,
}: {
  deal: BdDeal
  isAdmin: boolean
  onStageChange: (deal: BdDeal, stage: string) => void
  onEdit: (deal: BdDeal) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const daysInStage = daysSince(deal.entered_stage_at)
  const daysSinceContact = daysSince(deal.last_contact)
  const isStuck = daysInStage !== null && daysInStage > 21
  const isCold = daysSinceContact !== null && daysSinceContact > 14

  return (
    <div
      className={`border ${STAGE_BORDER[deal.stage] ?? 'border-sand3'} bg-sand p-3 space-y-2 ${isStuck || isCold ? 'ring-1 ring-red-300' : ''}`}
    >
      {/* Company + controls */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => setExpanded(v => !v)}
          className="font-bold text-sm leading-tight text-left hover:underline flex-1"
        >
          {deal.company}
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          {(deal.year1_value ?? 0) > 0 && (
            <span className="text-xs font-mono text-ink3">{fmt(deal.year1_value!)}</span>
          )}
          {isAdmin && (
            <button onClick={() => onEdit(deal)} className="text-ink4 hover:text-ink text-xs px-1">✎</button>
          )}
          <button onClick={() => setExpanded(v => !v)} className="text-ink4 text-xs px-0.5">
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Contact */}
      {deal.contact_name && (
        <div className="text-xs text-ink3">
          {deal.contact_name}{deal.contact_title ? ` · ${deal.contact_title}` : ''}
        </div>
      )}

      {/* Probability + days in stage */}
      <div className="flex items-center gap-2 flex-wrap">
        {deal.probability_pct !== null && (
          <span className="text-xs font-bold">{deal.probability_pct}%</span>
        )}
        {deal.owner && (
          <span className="text-[11px] text-ink4">{deal.owner}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {daysSinceContact !== null && (
            <span className="text-[11px] text-ink4" title="Days since last contact">
              📞 <DaysChip days={daysSinceContact} warnAfter={10} alertAfter={14} />
            </span>
          )}
          {daysInStage !== null && (
            <span className="text-[11px] text-ink4" title="Days in this stage">
              ⏱ <DaysChip days={daysInStage} warnAfter={14} alertAfter={21} />
            </span>
          )}
        </div>
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1 bg-sand3">
          <div className="h-full bg-black transition-all" style={{ width: `${deal.score}%` }} />
        </div>
        <span className="text-[10px] font-mono text-ink4">{deal.score}</span>
      </div>

      {/* Next action */}
      {deal.next_action && (
        <div className="text-[11px] text-ink3 border-t border-sand3 pt-2 leading-snug">
          → {deal.next_action}
          {deal.next_action_by && <span className="text-ink4"> · {deal.next_action_by}</span>}
        </div>
      )}

      {/* Stage mover (admin only) */}
      {isAdmin && (
        <div className="flex gap-1 pt-1">
          {STAGES.filter(s => s !== deal.stage).map(s => (
            <button
              key={s}
              onClick={() => onStageChange(deal, s)}
              className="text-[10px] text-ink4 hover:text-ink border border-sand3 px-1.5 py-0.5 hover:border-ink3 transition-colors"
            >
              → {s}
            </button>
          ))}
        </div>
      )}

      {/* Activity log — lazy loaded on expand */}
      {expanded && (
        <ActivityLog dealId={deal.id} canAdd={true} />
      )}
    </div>
  )
}

// ─── Edit Modal ─────────────────────────────────────────────────────────────

function EditModal({
  deal, onSave, onClose, onDelete, isAdmin,
}: {
  deal: Partial<BdDeal> & { id?: string }
  onSave: (data: Omit<BdDeal, 'id'>) => void
  onClose: () => void
  onDelete?: () => void
  isAdmin: boolean
}) {
  const [form, setForm] = useState({ ...EMPTY_DEAL, ...deal })
  const set = (k: keyof typeof EMPTY_DEAL, v: string | number | null) =>
    setForm(f => ({ ...f, [k]: v }))

  const TEAM_NAMES = REPORT_MEMBERS

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-sand w-full max-w-lg max-h-[90vh] overflow-y-auto border border-sand3 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-sand3 sticky top-0 bg-sand">
          <span className="font-bold text-sm">{deal.id ? 'Edit Deal' : 'New Deal'}</span>
          <button onClick={onClose} className="text-ink4 hover:text-ink text-lg leading-none">✕</button>
        </div>

        <div className="p-4 space-y-3">
          {/* Company */}
          <div>
            <label className="field-label">Company *</label>
            <input className="field-input" value={form.company}
              onChange={e => set('company', e.target.value)} placeholder="Company / opportunity name" />
          </div>

          {/* Stage + Source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Stage</label>
              <select className="field-input" value={form.stage} onChange={e => set('stage', e.target.value)}>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Source</label>
              <select className="field-input" value={form.source} onChange={e => set('source', e.target.value)}>
                <option value="">— Select —</option>
                {['Inbound', 'Referral', 'Outbound', 'Conference', 'Other'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Contact Name</label>
              <input className="field-input" value={form.contact_name}
                onChange={e => set('contact_name', e.target.value)} placeholder="Jane Smith" />
            </div>
            <div>
              <label className="field-label">Contact Title</label>
              <input className="field-input" value={form.contact_title}
                onChange={e => set('contact_title', e.target.value)} placeholder="CFO" />
            </div>
          </div>

          {/* Revenue */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Year 1 Value ($)</label>
              <input className="field-input font-mono" type="number" min={0}
                value={form.year1_value ?? ''} placeholder="600000"
                onChange={e => set('year1_value', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <label className="field-label">Probability (%)</label>
              <input className="field-input font-mono" type="number" min={0} max={100}
                value={form.probability_pct ?? ''} placeholder="60"
                onChange={e => set('probability_pct', e.target.value ? Number(e.target.value) : null)} />
            </div>
          </div>

          {/* Owner + Score */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Owner</label>
              <select className="field-input" value={form.owner} onChange={e => set('owner', e.target.value)}>
                <option value="">— Select —</option>
                {TEAM_NAMES.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Score (0–100)</label>
              <input className="field-input font-mono" type="number" min={0} max={100}
                value={form.score} onChange={e => set('score', Number(e.target.value))} />
            </div>
          </div>

          {/* Last contact */}
          <div>
            <label className="field-label">Last Contact Date</label>
            <input className="field-input" type="date"
              value={form.last_contact ?? ''}
              onChange={e => set('last_contact', e.target.value || null)} />
          </div>

          {/* Next action */}
          <div>
            <label className="field-label">Next Action</label>
            <input className="field-input" value={form.next_action}
              onChange={e => set('next_action', e.target.value)} placeholder="Send LOI, Schedule follow-up call..." />
          </div>
          <div>
            <label className="field-label">Next Action By</label>
            <select className="field-input" value={form.next_action_by} onChange={e => set('next_action_by', e.target.value)}>
              <option value="">— Select —</option>
              {TEAM_NAMES.map(n => <option key={n}>{n}</option>)}
            </select>
          </div>

          {/* Legacy fields */}
          <div>
            <label className="field-label">RampRate Cut</label>
            <input className="field-input" value={form.ramprate_cut}
              onChange={e => set('ramprate_cut', e.target.value)} placeholder="8% + $50K/mo" />
          </div>
          <div>
            <label className="field-label">ImpactSoul Alignment</label>
            <input className="field-input" value={form.impactsoul}
              onChange={e => set('impactsoul', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Notes</label>
            <textarea className="field-input resize-none" rows={3} value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-sand3 sticky bottom-0 bg-sand">
          {deal.id && onDelete && isAdmin ? (
            <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 underline">Delete deal</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-xs">Cancel</button>
            <button
              onClick={() => onSave(form)}
              disabled={!form.company}
              className="btn-primary text-xs disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function BdPage() {
  const { isAdmin } = useMe()
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [deals, setDeals] = useState<BdDeal[]>([])
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null)
  const [kpiLoading, setKpiLoading] = useState(true)
  const [dealsLoading, setDealsLoading] = useState(true)
  const [today, setToday] = useState('')
  const [editDeal, setEditDeal] = useState<Partial<BdDeal> | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }))

    Promise.all([
      fetch('/api/webwork', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/slack-stats', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/clickup-tasks', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/invoices', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ]).then(([ww, slack, cu, inv]) => {
      setKpi({
        teamHours: ww?.members?.reduce((s: number, m: { totalHours: number }) => s + m.totalHours, 0) ?? 0,
        memberHours: ww?.members ?? [],
        reportsFiled: slack?.weeklyReports?.filed?.length ?? 0,
        reportsTotal: REPORT_MEMBERS.length,
        reportsMissing: slack?.weeklyReports?.missing ?? [],
        totalTasks: cu?.totalTasks ?? 0,
        overdue: cu?.overdue ?? 0,
        overduePercent: cu?.overduePercent ?? 0,
        urgent: cu?.urgent ?? 0,
        invoiceCount: inv?.invoices?.length ?? 0,
        invoicePending: inv?.invoices?.filter((i: { status: string }) => i.status === 'pending').length ?? 0,
      })
      setKpiLoading(false)
    })

    fetch('/api/bd', { cache: 'no-store' }).then(r => r.json()).then(d => {
      setDeals(Array.isArray(d) ? d : (d.deals ?? []))
      if (d.metrics) setMetrics(d.metrics)
      setDealsLoading(false)
    }).catch(() => setDealsLoading(false))
  }, [])

  async function handleSave(data: Omit<BdDeal, 'id'>) {
    setSaving(true)
    if (editDeal?.id) {
      // Update
      await fetch(`/api/bd/${editDeal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      setDeals(prev => prev.map(d => d.id === editDeal.id ? { ...d, ...data } : d))
    } else {
      // Create
      const res = await fetch('/api/bd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const created = await res.json()
        setDeals(prev => [created, ...prev])
      }
    }
    setEditDeal(null)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this deal?')) return
    await fetch(`/api/bd/${id}`, { method: 'DELETE' })
    setDeals(prev => prev.filter(d => d.id !== id))
    setEditDeal(null)
  }

  async function handleStageChange(deal: BdDeal, stage: string) {
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage } : d))
    await fetch(`/api/bd/${deal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
  }

  const dealsByStage = (stage: string) =>
    deals.filter(d => d.stage === stage).sort((a, b) => b.score - a.score)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="pt-6 space-y-6">

      {/* Edit modal */}
      {editDeal !== null && (
        <EditModal
          deal={editDeal}
          isAdmin={isAdmin}
          onSave={handleSave}
          onClose={() => setEditDeal(null)}
          onDelete={editDeal.id ? () => handleDelete(editDeal.id!) : undefined}
        />
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl tracking-widest">BD PIPELINE</h1>
        <div className="flex items-center gap-3">
          {today && <span className="text-xs text-ink4">{today}</span>}
          {isAdmin && (
            <button onClick={() => setEditDeal(EMPTY_DEAL)} className="btn-primary text-xs py-1 px-3">
              + New Deal
            </button>
          )}
        </div>
      </div>

      {/* ── Revenue forecast strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          {
            value: dealsLoading ? '…' : fmt(metrics?.weightedPipeline ?? 0),
            label: 'Weighted Pipeline',
            sub: 'prob-adjusted value',
            alert: false,
          },
          {
            value: dealsLoading ? '…' : fmt(metrics?.totalPipeline ?? 0),
            label: 'Total Pipeline',
            sub: 'unweighted, excl. deferred',
            alert: false,
          },
          {
            value: dealsLoading ? '…' : metrics?.totalDeals ?? 0,
            label: 'Active Deals',
            sub: 'excl. deferred',
            alert: false,
          },
          {
            value: dealsLoading ? '…' : metrics?.goneCold ?? 0,
            label: 'Gone Cold',
            sub: 'no contact 14d+',
            alert: !dealsLoading && (metrics?.goneCold ?? 0) > 0,
          },
          {
            value: dealsLoading ? '…' : metrics?.stuck ?? 0,
            label: 'Stuck',
            sub: 'same stage 21d+',
            alert: !dealsLoading && (metrics?.stuck ?? 0) > 0,
          },
        ].map(t => (
          <div key={t.label} className={`border p-3 ${t.alert ? 'border-red-300 bg-red-50' : 'border-sand3'} ${dealsLoading ? 'animate-pulse' : ''}`}>
            <div className="font-serif font-black text-3xl">{t.value}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink3 mt-0.5">{t.label}</div>
            {t.sub && <div className="text-xs text-ink4 mt-0.5">{t.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Operations KPIs ────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-2">Operations</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            {
              value: kpiLoading ? '…' : `${Math.round(kpi?.teamHours ?? 0)}h`,
              label: 'Team Hours',
              sub: `${kpi?.memberHours?.filter(m => m.totalHours > 0).length ?? 0} members active`,
              alert: false,
            },
            {
              value: kpiLoading ? '…' : `${kpi?.reportsFiled ?? 0}/${kpi?.reportsTotal ?? REPORT_MEMBERS.length}`,
              label: 'Reports Filed',
              sub: (kpi?.reportsMissing?.length ?? 0) > 0
                ? `Missing: ${kpi!.reportsMissing.map(n => n.split(' ')[0]).join(', ')}`
                : 'All filed ✓',
              alert: !kpiLoading && (kpi?.reportsMissing?.length ?? 0) > 0,
            },
            {
              value: kpiLoading ? '…' : `${kpi?.overduePercent ?? 0}%`,
              label: 'CRM Overdue',
              sub: `${kpi?.overdue ?? 0} of ${kpi?.totalTasks ?? 0} tasks · ${kpi?.urgent ?? 0} urgent`,
              alert: !kpiLoading && (kpi?.overduePercent ?? 0) > 50,
            },
            {
              value: kpiLoading ? '…' : kpi?.invoiceCount ?? 0,
              label: 'Invoices',
              sub: `${kpi?.invoicePending ?? 0} pending`,
              alert: !kpiLoading && (kpi?.invoicePending ?? 0) > 0,
            },
            {
              value: kpiLoading ? '…' : `$31K`,
              label: 'Closed YTD',
              sub: 'target $5M',
              alert: false,
            },
          ].map(t => (
            <div key={t.label} className={`border p-3 ${t.alert ? 'border-red-300 bg-red-50' : 'border-sand3'} ${kpiLoading ? 'animate-pulse' : ''}`}>
              <div className="font-serif font-black text-2xl">{t.value}</div>
              <div className="text-xs font-bold uppercase tracking-widest text-ink3 mt-0.5">{t.label}</div>
              {t.sub && <div className="text-xs text-ink4 mt-0.5">{t.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Kanban ─────────────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-3">Pipeline</div>
        {dealsLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {STAGES.map(s => (
              <div key={s} className="border border-sand3 p-3 animate-pulse">
                <div className="text-xs font-bold uppercase tracking-widest text-ink4 mb-2">{s}</div>
                <div className="h-16 bg-sand2 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
            {STAGES.map(stage => {
              const col = dealsByStage(stage)
              const colValue = col.reduce((s, d) => s + Number(d.year1_value ?? 0), 0)
              return (
                <div key={stage} className="space-y-2">
                  {/* Column header */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold px-2 py-0.5 ${STAGE_COLOR[stage]}`}>
                      {stage.toUpperCase()}
                    </span>
                    <div className="text-xs text-ink4">
                      {col.length} deal{col.length !== 1 ? 's' : ''}
                      {colValue > 0 && ` · ${fmt(colValue)}`}
                    </div>
                  </div>

                  {/* Cards */}
                  {col.length === 0 ? (
                    <div className="border border-dashed border-sand3 p-4 text-xs text-ink4 text-center">
                      No {stage.toLowerCase()} deals
                    </div>
                  ) : (
                    col.map(deal => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        isAdmin={isAdmin}
                        onStageChange={handleStageChange}
                        onEdit={setEditDeal}
                      />
                    ))
                  )}

                  {/* Add to column shortcut (admin) */}
                  {isAdmin && (
                    <button
                      onClick={() => setEditDeal({ ...EMPTY_DEAL, stage })}
                      className="w-full text-xs text-ink4 hover:text-ink border border-dashed border-sand3 hover:border-ink3 py-2 transition-colors"
                    >
                      + Add {stage}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Hours bar ──────────────────────────────────────────────────────── */}
      {!kpiLoading && (kpi?.memberHours?.length ?? 0) > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-2">Hours by Member This Week</div>
          <div className="card divide-y divide-sand3">
            {[...(kpi?.memberHours ?? [])].sort((a, b) => b.totalHours - a.totalHours).map(m => (
              <div key={m.username} className="flex items-center gap-3 px-4 py-2">
                <span className="text-sm capitalize w-24 flex-shrink-0">{m.username}</span>
                <div className="flex-1 h-1.5 bg-sand3">
                  <div className="h-full bg-black transition-all" style={{ width: `${Math.min(100, (m.totalHours / 40) * 100)}%` }} />
                </div>
                <span className="font-mono text-xs w-10 text-right">{m.totalHours}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
