'use client'

import { useEffect, useState } from 'react'

interface Request {
  id: string
  name: string
  email: string | null
  username_requested: string | null
  role_requested: string | null
  message: string | null
  status: string
  created_at: string
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/settings/requests')
    if (res.ok) setRequests(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function approve(req: Request) {
    const res = await fetch(`/api/settings/requests/${req.id}/approve`, { method: 'POST' })
    const d = await res.json()
    if (res.ok) setMsg(`✅ Approved ${req.name} · username: ${d.username} · temp PW: ${d.tempPassword}`)
    load()
  }

  async function reject(req: Request) {
    await fetch(`/api/settings/requests/${req.id}/reject`, { method: 'POST' })
    load()
  }

  const pending = requests.filter(r => r.status === 'pending')
  const past = requests.filter(r => r.status !== 'pending')

  if (loading) return <div className="text-ink4 text-sm pt-8">Loading…</div>

  return (
    <div className="pt-6 space-y-4">
      <h1 className="font-display text-xl tracking-widest">Access Requests</h1>

      {msg && <div className="card p-3 text-sm font-mono break-all">{msg}</div>}

      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-2">
          Pending ({pending.length})
        </div>
        <div className="card divide-y divide-border">
          {pending.map(r => (
            <div key={r.id} className="px-4 py-3 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-semibold text-sm">{r.name}</span>
                  {r.email && <span className="text-ink3 text-xs ml-2">{r.email}</span>}
                  <div className="text-xs text-ink4 mt-0.5">
                    Requested: {r.username_requested || '—'} · {r.role_requested || 'user'}
                  </div>
                  {r.message && <div className="text-xs text-ink3 mt-1 italic">"{r.message}"</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => approve(r)} className="btn-primary text-xs py-1 px-3">Approve</button>
                  <button onClick={() => reject(r)} className="btn-secondary text-xs py-1 px-3">Reject</button>
                </div>
              </div>
            </div>
          ))}
          {pending.length === 0 && (
            <div className="px-4 py-6 text-center text-ink4 text-sm">No pending requests</div>
          )}
        </div>
      </div>

      {past.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-2">History</div>
          <div className="card divide-y divide-border">
            {past.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2">
                <span className="text-sm flex-1">{r.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${r.status === 'approved' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
