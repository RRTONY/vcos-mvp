'use client'

import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { ShareSlackButton, ShareClickUpButton } from '@/components/ShareButtons'

interface Loop {
  id: string
  p: 'critical' | 'high'
  owner: string
  due: string
  text: string
  resolved?: boolean
}

const INITIAL_LOOPS: Loop[] = [
  { id: 'L1', p: 'critical', owner: 'Alex + Tony', due: 'Before 2 PM today', text: 'ImpactSoul narrative contradiction — Sections 2 vs 11 vs 13 conflict. Must resolve before Reeve call.' },
  { id: 'L2', p: 'critical', owner: 'Josh', due: 'Today EOD', text: 'Weekly report not filed. Kim bumped twice re Maxwell Biosciences + Peptoid World emails.' },
  { id: 'L3', p: 'critical', owner: 'Alex', due: 'Today EOD', text: 'Weekly report not filed. Reeve workload note needed (40–50% vs 25% proposed).' },
  { id: 'L4', p: 'critical', owner: 'Kim', due: 'Today', text: 'BILL.com 12 sync conflicts + Holographik invoice — resolve before EOD.' },
  { id: 'L5', p: 'high', owner: 'Kim', due: 'Mar 18', text: 'Update #weeklyreports bot template — add Braintrust 4-point section (questions 14–17).' },
  { id: 'L6', p: 'high', owner: 'Tony + Ben', due: 'This week', text: 'Ben Sheppard scope + compensation conversation — explicitly requested by Ben.' },
  { id: 'L7', p: 'high', owner: 'Tony / Kim', due: 'This week', text: 'ImpactSoul legal entity formation — no entity = no grants, no Series A.' },
]

export default function OpenLoopsPage() {
  const [loops, setLoops] = useState<Loop[]>(INITIAL_LOOPS)
  const { toast } = useToast()

  function resolve(id: string) {
    setLoops((prev) => prev.map((l) => (l.id === id ? { ...l, resolved: true } : l)))
    toast('Loop marked resolved')
  }

  const open = loops.filter((l) => !l.resolved)
  const resolved = loops.filter((l) => l.resolved)

  return (
    <div>
      <div className="slbl mt-6">Critical Open Loops — Mar 16, 2026</div>
      {open.length > 0 ? (
        <div className="alert alert-red mb-4">
          {open.length} item{open.length !== 1 ? 's' : ''} require resolution this week.
        </div>
      ) : (
        <div className="alert alert-amber mb-4">All loops resolved ✓</div>
      )}

      <div className="space-y-2">
        {open.map((l) => {
          const isCritical = l.p === 'critical'
          return (
            <div
              key={l.id}
              className={`card border-l-4 mb-0 ${isCritical ? 'border-l-ink' : 'border-l-ink3'}`}
            >
              <div className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`text-xs font-bold px-1.5 py-0.5 ${isCritical ? 'bg-ink text-sand' : 'bg-sand2 text-ink3'}`}>
                      {l.p}
                    </span>
                    <span className="text-xs font-bold text-ink3">{l.owner}</span>
                    <span className="text-xs text-ink4">· {l.due}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{l.text}</p>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <ShareClickUpButton
                    title={`[VCOS Loop] ${l.owner} — ${l.due}`}
                    description={l.text}
                    priority={l.p === 'critical' ? 1 : 2}
                    label="→ ClickUp"
                  />
                  <button onClick={() => resolve(l.id)} className="btn-secondary">
                    ✓ Resolve
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {resolved.length > 0 && (
        <>
          <div className="slbl mt-6">Resolved ({resolved.length})</div>
          <div className="space-y-2 opacity-40">
            {resolved.map((l) => (
              <div key={l.id} className="card border-l-4 border-l-sand3 mb-0">
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-ink4">{l.owner}</span>
                      <span className="text-xs text-ink4">· {l.due}</span>
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
