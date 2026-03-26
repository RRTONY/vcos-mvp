'use client'

import { useEffect, useState } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────

interface BdDeal {
  id: string
  company: string
  stage: string        // Warm | Cold | Deferred | Active
  score: number
  year1: string
  ramprate_cut: string
  speed_to_close: string
  impactsoul: string
  probability: string
  structure: string
  notes: string
}

interface KpiData {
  // WebWork
  teamHours: number
  memberHours: { username: string; totalHours: number }[]
  // Slack
  reportsFiled: number
  reportsTotal: number
  reportsMissing: string[]
  // ClickUp
  totalTasks: number
  overdue: number
  overduePercent: number
  urgent: number
  // Invoices
  invoiceCount: number
  invoicePending: number
}

const STAGE_COLOR: Record<string, string> = {
  Active:   'bg-black text-white',
  Warm:     'bg-amber-100 text-amber-800',
  Cold:     'bg-blue-50 text-blue-700',
  Deferred: 'bg-sand2 text-ink3',
}

const STAGES = ['Active', 'Warm', 'Cold', 'Deferred']

const EMPTY_DEAL: Omit<BdDeal, 'id'> = {
  company: '', stage: 'Warm', score: 50,
  year1: '', ramprate_cut: '', speed_to_close: '',
  impactsoul: '', probability: '', structure: '', notes: '',
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function BdPage() {
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [deals, setDeals] = useState<BdDeal[]>([])
  const [kpiLoading, setKpiLoading] = useState(true)
  const [dealsLoading, setDealsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [today, setToday] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newDeal, setNewDeal] = useState<Omit<BdDeal, 'id'>>(EMPTY_DEAL)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<string>('All')

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }))

    fetch('/api/auth/me').then(r => r.ok ? r.json() : null)
      .then(d => setIsAdmin(d?.role === 'admin'))
      .catch(() => {})

    // Fetch KPI data from all sources in parallel
    Promise.all([
      fetch('/api/webwork').then(r => r.json()).catch(() => null),
      fetch('/api/slack-stats').then(r => r.json()).catch(() => null),
      fetch('/api/clickup-tasks').then(r => r.json()).catch(() => null),
      fetch('/api/invoices').then(r => r.json()).catch(() => null),
    ]).then(([ww, slack, cu, inv]) => {
      setKpi({
        teamHours: ww?.members?.reduce((s: number, m: { totalHours: number }) => s + m.totalHours, 0) ?? 0,
        memberHours: ww?.members ?? [],
        reportsFiled: slack?.weeklyReports?.filed?.length ?? 0,
        reportsTotal: 8,
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

    // Fetch BD deals
    fetch('/api/bd').then(r => r.json()).then(d => {
      setDeals(Array.isArray(d) ? d : [])
      setDealsLoading(false)
    }).catch(() => setDealsLoading(false))
  }, [])

  async function saveDeal(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/bd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDeal),
    })
    if (res.ok) {
      const d = await res.json()
      setDeals(prev => [d, ...prev].sort((a, b) => b.score - a.score))
      setShowAdd(false)
      setNewDeal(EMPTY_DEAL)
    }
    setSaving(false)
  }

  async function updateStage(deal: BdDeal, stage: string) {
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage } : d))
    await fetch(`/api/bd/${deal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
  }

  async function updateScore(deal: BdDeal, score: number) {
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, score } : d))
    await fetch(`/api/bd/${deal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score }),
    })
  }

  async function deleteDeal(id: string) {
    if (!confirm('Delete this deal?')) return
    await fetch(`/api/bd/${id}`, { method: 'DELETE' })
    setDeals(prev => prev.filter(d => d.id !== id))
  }

  const filtered = stageFilter === 'All' ? deals : deals.filter(d => d.stage === stageFilter)
  const totalPipeline = deals.length

  // ─── KPI Tiles ────────────────────────────────────────────────────────────

  const tiles = [
    {
      label: 'Team Hours This Week',
      value: kpiLoading ? '…' : `${Math.round(kpi?.teamHours ?? 0)}h`,
      sub: kpiLoading ? '' : `across ${kpi?.memberHours?.filter(m => m.totalHours > 0).length ?? 0} members`,
      alert: false,
    },
    {
      label: 'Reports Filed',
      value: kpiLoading ? '…' : `${kpi?.reportsFiled ?? 0}/${kpi?.reportsTotal ?? 8}`,
      sub: kpiLoading ? '' : (kpi?.reportsMissing?.length ?? 0) > 0
        ? `Missing: ${kpi!.reportsMissing.map(n => n.split(' ')[0]).join(', ')}`
        : 'All filed ✓',
      alert: !kpiLoading && (kpi?.reportsMissing?.length ?? 0) > 0,
    },
    {
      label: 'CRM Overdue',
      value: kpiLoading ? '…' : `${kpi?.overduePercent ?? 0}%`,
      sub: kpiLoading ? '' : `${kpi?.overdue ?? 0} of ${kpi?.totalTasks ?? 0} tasks · ${kpi?.urgent ?? 0} urgent`,
      alert: !kpiLoading && (kpi?.overduePercent ?? 0) > 50,
    },
    {
      label: 'BD Pipeline',
      value: dealsLoading ? '…' : `${totalPipeline}`,
      sub: dealsLoading ? '' : `${deals.filter(d => d.stage === 'Active').length} active · ${deals.filter(d => d.stage === 'Warm').length} warm`,
      alert: false,
    },
    {
      label: 'Invoice Compliance',
      value: kpiLoading ? '…' : `${kpi?.invoiceCount ?? 0}`,
      sub: kpiLoading ? '' : `${kpi?.invoicePending ?? 0} pending`,
      alert: !kpiLoading && (kpi?.invoicePending ?? 0) > 0,
    },
  ]

  return (
    <div className="pt-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl tracking-widest">Daily KPI Dashboard</h1>
        {today && <span className="text-xs text-ink4">{today}</span>}
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {tiles.map(t => (
          <div key={t.label} className={`border p-3 ${t.alert ? 'border-red-300 bg-red-50' : 'border-sand3'} ${kpiLoading ? 'animate-pulse' : ''}`}>
            <div className="font-serif font-black text-3xl">{t.value}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink3 mt-0.5">{t.label}</div>
            {t.sub && <div className="text-xs text-ink4 mt-0.5">{t.sub}</div>}
          </div>
        ))}
      </div>

      {/* Hours bar */}
      {!kpiLoading && (kpi?.memberHours?.length ?? 0) > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-2">Hours by Member This Week</div>
          <div className="card divide-y divide-sand3">
            {[...(kpi?.memberHours ?? [])].sort((a, b) => b.totalHours - a.totalHours).map(m => (
              <div key={m.username} className="flex items-center gap-3 px-4 py-2">
                <span className="text-sm capitalize w-20 flex-shrink-0">{m.username}</span>
                <div className="flex-1 h-1.5 bg-sand3">
                  <div className="h-full bg-black transition-all" style={{ width: `${Math.min(100, (m.totalHours / 40) * 100)}%` }} />
                </div>
                <span className="font-mono text-xs w-10 text-right">{m.totalHours}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BD Pipeline */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold uppercase tracking-widest text-ink3">BD Pipeline</div>
          <div className="flex gap-2">
            {/* Stage filter */}
            {['All', ...STAGES].map(s => (
              <button
                key={s}
                onClick={() => setStageFilter(s)}
                className={`text-xs px-2 py-0.5 border transition-colors ${stageFilter === s ? 'bg-black text-white border-black' : 'border-sand3 text-ink3 hover:border-ink3'}`}
              >
                {s}
              </button>
            ))}
            {isAdmin && (
              <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-xs py-0.5 px-2">+ Add</button>
            )}
          </div>
        </div>

        {/* Add deal form */}
        {showAdd && isAdmin && (
          <form onSubmit={saveDeal} className="card p-4 space-y-3 mb-3">
            <div className="text-xs font-bold uppercase tracking-widest text-ink3">New Deal</div>
            <div className="grid grid-cols-2 gap-3">
              <input className="field-input col-span-2" placeholder="Company / Opportunity *" value={newDeal.company}
                onChange={e => setNewDeal({ ...newDeal, company: e.target.value })} required />
              <select className="field-input" value={newDeal.stage} onChange={e => setNewDeal({ ...newDeal, stage: e.target.value })}>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
              <input className="field-input" placeholder="Score (0-100)" type="number" min={0} max={100}
                value={newDeal.score} onChange={e => setNewDeal({ ...newDeal, score: Number(e.target.value) })} />
              <input className="field-input" placeholder="Year 1 revenue (e.g. $600K)" value={newDeal.year1}
                onChange={e => setNewDeal({ ...newDeal, year1: e.target.value })} />
              <input className="field-input" placeholder="RampRate cut (e.g. 8% + $50K/mo)" value={newDeal.ramprate_cut}
                onChange={e => setNewDeal({ ...newDeal, ramprate_cut: e.target.value })} />
              <input className="field-input" placeholder="Speed to close (e.g. 45-60 days)" value={newDeal.speed_to_close}
                onChange={e => setNewDeal({ ...newDeal, speed_to_close: e.target.value })} />
              <input className="field-input" placeholder="Probability (e.g. 60%)" value={newDeal.probability}
                onChange={e => setNewDeal({ ...newDeal, probability: e.target.value })} />
              <input className="field-input col-span-2" placeholder="ImpactSoul alignment" value={newDeal.impactsoul}
                onChange={e => setNewDeal({ ...newDeal, impactsoul: e.target.value })} />
              <input className="field-input col-span-2" placeholder="Deal structure" value={newDeal.structure}
                onChange={e => setNewDeal({ ...newDeal, structure: e.target.value })} />
              <textarea className="field-input col-span-2" rows={2} placeholder="Notes" value={newDeal.notes}
                onChange={e => setNewDeal({ ...newDeal, notes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary text-xs">Save Deal</button>
              <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary text-xs">Cancel</button>
            </div>
          </form>
        )}

        {/* Deals table */}
        {dealsLoading ? (
          <div className="card p-6 text-center text-ink4 text-sm animate-pulse">Loading deals…</div>
        ) : filtered.length === 0 ? (
          <div className="card p-6 text-center text-ink4 text-sm">
            {deals.length === 0
              ? 'No deals yet. Click "+ Add" to enter your BD pipeline.'
              : `No ${stageFilter} deals.`}
          </div>
        ) : (
          <div className="card divide-y divide-sand3">
            {filtered.map(deal => (
              <div key={deal.id} className={`px-4 py-3 ${editId === deal.id ? 'bg-sand2/40' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{deal.company}</span>
                      {isAdmin ? (
                        <select
                          value={deal.stage}
                          onChange={e => updateStage(deal, e.target.value)}
                          className={`text-xs px-1.5 py-0.5 font-bold border-0 rounded cursor-pointer ${STAGE_COLOR[deal.stage] ?? 'bg-sand2 text-ink3'}`}
                        >
                          {STAGES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${STAGE_COLOR[deal.stage] ?? 'bg-sand2 text-ink3'}`}>
                          {deal.stage}
                        </span>
                      )}
                      {deal.probability && <span className="text-xs text-ink3">{deal.probability}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                      {deal.year1 && <span className="text-xs text-ink3">Year 1: <span className="font-medium text-ink1">{deal.year1}</span></span>}
                      {deal.ramprate_cut && <span className="text-xs text-ink3">Cut: {deal.ramprate_cut}</span>}
                      {deal.speed_to_close && <span className="text-xs text-ink3">Close: {deal.speed_to_close}</span>}
                    </div>
                    {deal.impactsoul && <div className="text-xs text-ink4 mt-0.5 italic">{deal.impactsoul}</div>}
                    {deal.notes && editId === deal.id && <div className="text-xs text-ink3 mt-1">{deal.notes}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isAdmin && (
                      <input
                        type="number" min={0} max={100}
                        value={deal.score}
                        onChange={e => updateScore(deal, Number(e.target.value))}
                        className="w-12 text-center text-xs border border-sand3 bg-canvas py-0.5 rounded font-mono"
                        title="Deal score"
                      />
                    )}
                    <div className="w-12 h-1.5 bg-sand3">
                      <div className="h-full bg-black" style={{ width: `${deal.score}%` }} />
                    </div>
                    {isAdmin && (
                      <>
                        <button onClick={() => setEditId(editId === deal.id ? null : deal.id)}
                          className="text-xs text-ink3 hover:text-ink underline">
                          {editId === deal.id ? 'Close' : 'Detail'}
                        </button>
                        <button onClick={() => deleteDeal(deal.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                      </>
                    )}
                  </div>
                </div>
                {editId === deal.id && deal.structure && (
                  <div className="mt-2 text-xs text-ink3 border-t border-sand3 pt-2">
                    <span className="font-bold">Structure:</span> {deal.structure}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
