'use client'

import { useState, useEffect, useRef } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import { useToast } from '@/components/Toast'

interface OverdueTask {
  id: string
  name: string
  list: string
  dueDate: string
  priority: string
  url: string
  assignees: string[]
}

interface Loop {
  id: string
  p: 'critical' | 'high'
  text: string
  list: string
  dueDate: string
  assignees: string[]
  url: string
  dismissed?: boolean
}

const FALLBACK_LOOPS: Loop[] = [
  { id: 'L4', p: 'critical', text: 'BILL.com 12 sync conflicts + Holographik invoice — resolve before EOD.', list: 'Finance', dueDate: 'Today', assignees: ['Kim'], url: 'https://app.clickup.com/10643959/home' },
  { id: 'L5', p: 'high', text: 'Update #weeklyreports bot template — add Braintrust 4-point section.', list: 'Operations', dueDate: 'Mar 18', assignees: ['Kim'], url: 'https://app.clickup.com/10643959/home' },
  { id: 'L7', p: 'high', text: 'ImpactSoul legal entity formation — no entity = no grants, no Series A.', list: 'Legal', dueDate: 'This week', assignees: ['Tony', 'Kim'], url: 'https://app.clickup.com/10643959/home' },
]

function taskToLoop(t: OverdueTask, p: 'critical' | 'high'): Loop {
  return {
    id: t.id,
    p,
    text: t.name,
    list: t.list,
    dueDate: t.dueDate || 'No due date',
    assignees: t.assignees,
    url: t.url,
  }
}

export default function OpenLoopsPage() {
  const [loops, setLoops] = useState<Loop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { refreshKey } = useRefresh()
  const prevRefreshKey = useRef(refreshKey)
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false
    async function fetchLoops() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch('/api/clickup-tasks')
        if (!res.ok) throw new Error('API error')
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        const urgent: Loop[] = (data.urgentDetails ?? []).map((t: OverdueTask) => taskToLoop(t, 'critical'))
        const high: Loop[] = (data.highDetails ?? []).map((t: OverdueTask) => taskToLoop(t, 'high'))
        if (!cancelled) {
          setLoops([...urgent, ...high])
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setError(true)
          setLoops(FALLBACK_LOOPS)
          setLoading(false)
        }
      }
    }
    fetchLoops()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (refreshKey === prevRefreshKey.current) return
    prevRefreshKey.current = refreshKey
    let cancelled = false
    async function refetch() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch('/api/clickup-tasks')
        if (!res.ok) throw new Error('API error')
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        const urgent: Loop[] = (data.urgentDetails ?? []).map((t: OverdueTask) => taskToLoop(t, 'critical'))
        const high: Loop[] = (data.highDetails ?? []).map((t: OverdueTask) => taskToLoop(t, 'high'))
        if (!cancelled) {
          setLoops([...urgent, ...high])
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setError(true)
          setLoops(FALLBACK_LOOPS)
          setLoading(false)
        }
      }
    }
    refetch()
    return () => { cancelled = true }
  }, [refreshKey])

  function dismiss(id: string) {
    setLoops((prev) => prev.map((l) => (l.id === id ? { ...l, dismissed: true } : l)))
    toast('Loop dismissed')
  }

  const open = loops.filter((l) => !l.dismissed)
  const dismissed = loops.filter((l) => l.dismissed)

  return (
    <div>
      <div className="slbl mt-6">Critical Open Loops</div>

      {loading ? (
        <div className="alert alert-amber animate-pulse">Fetching live data…</div>
      ) : error ? (
        <div className="alert alert-red mb-4">Could not load live ClickUp data — showing cached items.</div>
      ) : open.length === 0 ? (
        <div className="alert alert-amber mb-4" style={{ background: '#d1fae5', borderColor: '#6ee7b7', color: '#065f46' }}>
          No critical open loops ✓
        </div>
      ) : (
        <div className="alert alert-red mb-4">
          {open.length} item{open.length !== 1 ? 's' : ''} require resolution.
        </div>
      )}

      {!loading && (
        <div className="space-y-2">
          {open.map((l) => {
            const isCritical = l.p === 'critical'
            return (
              <div
                key={l.id}
                className={`card border-l-4 mb-2 ${isCritical ? 'border-l-red-600' : 'border-l-amber-500'}`}
              >
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-xs font-bold px-1.5 py-0.5 ${isCritical ? 'bg-black text-white' : 'bg-sand2 text-ink3'}`}>
                        {isCritical ? 'CRITICAL' : 'HIGH'}
                      </span>
                      {l.assignees.length > 0 && (
                        <span className="text-xs font-bold text-ink3">{l.assignees.join(' · ')}</span>
                      )}
                      <span className="text-xs text-ink4">· {l.dueDate}</span>
                    </div>
                    <p className="text-sm font-medium leading-relaxed">{l.text}</p>
                    <p className="text-xs text-ink3 mt-0.5">{l.list}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border border-sand3 px-2 py-1 text-xs font-bold hover:bg-sand2 transition-colors text-center"
                    >
                      → ClickUp
                    </a>
                    <button
                      onClick={() => dismiss(l.id)}
                      className="border border-sand3 px-2 py-1 text-xs hover:bg-sand2 transition-colors"
                    >
                      ✓ Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dismissed.length > 0 && (
        <>
          <div className="slbl mt-6">Dismissed ({dismissed.length})</div>
          <div className="space-y-2 opacity-40">
            {dismissed.map((l) => (
              <div key={l.id} className="card border-l-4 border-l-sand3 mb-0">
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {l.assignees.length > 0 && (
                        <span className="text-xs font-bold text-ink4">{l.assignees.join(' · ')}</span>
                      )}
                      <span className="text-xs text-ink4">· {l.dueDate}</span>
                    </div>
                    <p className="text-sm line-through text-ink4">{l.text}</p>
                  </div>
                  <span className="text-xs font-bold text-ink4">✓ Done</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
