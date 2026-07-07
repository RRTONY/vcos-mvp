'use client'

import { useState, useRef, useEffect } from 'react'
import { useToast } from '@/components/Toast'
import { useMe } from '@/hooks/useMe'
import { FiCheck } from 'react-icons/fi'
import Spinner from '@/components/Spinner'
import WeekCalendar from '@/components/WeekCalendar'

interface AiAnalysis {
  summary: string
  insights: string[]
  actions: string[]
}

import { getMondayOfWeekPT, fmtWeekRange, shiftWeeks, weekStartISO } from '@/lib/week-utils'
const getMostRecentMonday = getMondayOfWeekPT
const weekLabel = fmtWeekRange

const SECTIONS = [
  {
    title: 'Flags & Blockers',
    fields: [
      {
        name: 'blockers',
        label: '1. What is blocked, stuck, or at risk right now?',
        rows: 4,
        placeholder: 'List each blocker separately.\nFormat: Blocker → Impact if unresolved → What\'s needed → From whom',
      },
      {
        name: 'escalations',
        label: '2. Is anything broken, behind, or needs to be escalated?',
        rows: 3,
        placeholder: 'Client issues, missed commitments, process failures, team conflicts.\nFormat: Issue → Current status → Recommended action',
      },
    ],
  },
  {
    title: 'Next Week',
    fields: [
      {
        name: 'priorities',
        label: '3. What are your top 3–5 priorities for next week, in order?',
        rows: 5,
        placeholder: 'Include what "done" looks like for each.\nFormat: Priority → Definition of done → Owner if team\n1.\n2.\n3.',
      },
    ],
  },
  {
    title: 'Last Week in Review',
    fields: [
      {
        name: 'goals_met',
        label: '4. Which of last week\'s priorities did you complete — and what didn\'t get done, and why?',
        rows: 4,
        placeholder: 'Format: Priority → Done / Not done → Reason if not done',
      },
      {
        name: 'win',
        label: '5. What\'s the most important thing you accomplished this week, and what was the business impact?',
        rows: 3,
        placeholder: 'One key win and its business significance...',
      },
      {
        name: 'accomplishments',
        label: '6. Full list of accomplishments by area',
        rows: 6,
        placeholder: 'Sales:\nClient delivery:\nInternal operations:\nOther:',
      },
    ],
  },
  {
    title: 'Reflection',
    fields: [
      {
        name: 'friction',
        label: '7. What didn\'t go well — and what should change because of it?',
        rows: 3,
        placeholder: 'Be specific about the root cause and proposed fix...',
      },
      {
        name: 'went_well',
        label: '8. What went well that\'s worth repeating or recognizing?',
        rows: 3,
        placeholder: 'A process, decision, collaboration, or outcome worth doubling down on...',
      },
    ],
  },
  {
    title: 'Support & Personal',
    fields: [
      {
        name: 'support_needed',
        label: '9. What you need from others to support you',
        rows: 3,
        placeholder: 'Decisions, introductions, resources, unblocking — and from whom...',
      },
      {
        name: 'whats_new',
        label: '10. Personal notes (Optional) — interesting reads, personal milestones, family life',
        rows: 2,
        placeholder: 'Anything you\'d like to share...',
      },
    ],
  },
]

const DRAFT_KEY = 'vcos-weekly-report-draft'

export default function SubmitPage() {
  const { toast } = useToast()
  const { me, isAdmin } = useMe()
  const [submitting, setSubmitting] = useState(false)
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null)
  const [submittedName, setSubmittedName] = useState('')
  const [teamNames, setTeamNames] = useState<string[]>([])
  const [draftRestored, setDraftRestored] = useState(false)
  const [selectedMonday, setSelectedMonday] = useState<Date>(getMostRecentMonday)
  const [prevWeekPending, setPrevWeekPending] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // Managers can submit on behalf of anyone; everyone else is locked to themselves.
  const lockedName = !isAdmin ? (me?.fullName ?? null) : null

  const currentMonday = getMostRecentMonday()
  const prevMonday = shiftWeeks(currentMonday, -1)

  // Late-submission guard: if you're filing after Friday, the week picker
  // otherwise silently defaults to the current (new) week even though you
  // probably mean to catch up on last week's report. If last week is still
  // missing and you haven't filed this week either, jump the picker back to
  // last week; either way, flag it if you're sitting on the current week
  // while last week is still open.
  useEffect(() => {
    if (!lockedName) return
    Promise.all([
      fetch(`/api/weekly-reports?week_start=${weekStartISO(prevMonday)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => []),
      fetch(`/api/weekly-reports?week_start=${weekStartISO(currentMonday)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    ]).then(([prevReports, currReports]) => {
      const prevFiled = Array.isArray(prevReports) && prevReports.some((r: { submitted_by: string }) => r.submitted_by === lockedName)
      const currFiled = Array.isArray(currReports) && currReports.some((r: { submitted_by: string }) => r.submitted_by === lockedName)
      setPrevWeekPending(!prevFiled)
      if (!prevFiled && !currFiled) setSelectedMonday(prevMonday)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedName])

  useEffect(() => {
    if (!isAdmin) return // non-admins don't need the full roster
    fetch('/api/team', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: Array<{ full_name: string; active: boolean }>) =>
        setTeamNames((data ?? []).filter(m => m.active).map(m => m.full_name))
      )
      .catch(() => {})
  }, [isAdmin])

  // ── Auto-draft: persist answers to localStorage so a closed tab doesn't lose work ──
  function saveDraft() {
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    const obj: Record<string, string> = {}
    for (const [k, v] of fd.entries()) if (typeof v === 'string' && v.trim()) obj[k] = v
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(obj)) } catch { /* quota/private mode */ }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
  }
  function discardDraft() {
    clearDraft()
    formRef.current?.reset()
    setDraftRestored(false)
  }

  // Restore a saved draft on mount.
  useEffect(() => {
    if (!formRef.current) return
    let saved: string | null = null
    try { saved = localStorage.getItem(DRAFT_KEY) } catch { /* ignore */ }
    if (!saved) return
    try {
      const data = JSON.parse(saved) as Record<string, string>
      let restoredAny = false
      for (const [k, v] of Object.entries(data)) {
        const el = formRef.current.elements.namedItem(k) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
        if (el && 'value' in el) { el.value = v; restoredAny = true }
      }
      if (restoredAny) setDraftRestored(true)
    } catch { /* corrupt draft */ }
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    // Non-admins submit as themselves regardless of the form field (also enforced server-side).
    const name = (lockedName ?? (fd.get('name') as string))
    if (!name) { toast(isAdmin ? 'Please select a name first' : 'Your account is not linked to a team member — contact an admin'); return }
    fd.set('name', name)

    const payload: Record<string, string> = {}
    for (const [k, v] of fd.entries()) {
      payload[k] = v as string
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/weekly-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        setSubmittedName(name)
        setAnalysis(data.analysis ?? null)
        toast(`✓ Report submitted for ${name}`)
        clearDraft()
        setDraftRestored(false)
        formRef.current?.reset()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        toast(`Submit failed: ${data.error ?? 'Unknown error'}`)
      }
    } catch {
      toast('Network error — check connection')
    } finally {
      setSubmitting(false)
    }
  }

  if (analysis || submittedName) {
    return (
      <div className="space-y-4">
        <div className="alert alert-green">
          <FiCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Report submitted for <span className="font-bold">{submittedName}</span> — posted to #weeklyreports</span>
        </div>

        {analysis && (
          <div className="card">
            <div className="card-hd">
              <div className="card-ti">AI Analysis</div>
              <div className="text-xs text-ink3">Generated by Claude</div>
            </div>
            <div className="card-body space-y-4">
              <p className="text-sm text-ink2 leading-relaxed">{analysis.summary}</p>

              {analysis.insights?.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-2">Key Insights</div>
                  <ul className="space-y-1">
                    {analysis.insights.map((ins, i) => (
                      <li key={i} className="text-sm text-ink2 flex gap-2">
                        <span className="text-ink3 shrink-0">◆</span>
                        <span>{ins}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.actions?.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-2">Recommended Actions</div>
                  <ul className="space-y-1">
                    {analysis.actions.map((act, i) => (
                      <li key={i} className="text-sm text-ink2 flex gap-2">
                        <span className="text-warning shrink-0">→</span>
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => { setAnalysis(null); setSubmittedName('') }}
          className="btn-primary w-full sm:w-auto"
        >
          Submit Another Report
        </button>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} onInput={saveDraft} className="space-y-4">
      <div className="slbl mt-6">Weekly Report</div>
      {draftRestored && (
        <div className="alert alert-blue items-center justify-between">
          <span>Draft restored — your unsaved answers were recovered.</span>
          <button type="button" onClick={discardDraft} className="text-xs font-bold underline whitespace-nowrap">Start fresh</button>
        </div>
      )}

      <div className="card">
        <div className="card-hd"><div className="card-ti">Your Information</div></div>
        <div className="card-body space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">Your Name <span className="text-danger">*</span></label>
            {isAdmin ? (
              <select name="name" className="field-input" required>
                <option value="">— Select —</option>
                {teamNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : lockedName ? (
              <div className="field-input bg-sand2 flex items-center justify-between">
                <span className="font-semibold">{lockedName}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink4">You</span>
              </div>
            ) : (
              <div className="text-sm text-danger">
                Your account isn’t linked to a team member, so you can’t submit a report. Please contact an admin.
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">Report Week <span className="text-danger">*</span></label>
            <WeekCalendar selectedMonday={selectedMonday} onSelectWeek={setSelectedMonday} />
            <input type="hidden" name="week" value={weekLabel(selectedMonday)} />
            {prevWeekPending && selectedMonday.getTime() === currentMonday.getTime() && (
              <div className="alert alert-amber items-start justify-between mt-3 mb-0">
                <span>
                  It looks like you haven&apos;t submitted your report for the previous week ({weekLabel(prevMonday)}). Are you sure you want to submit a report for the current week? If you&apos;re submitting last week&apos;s report, please change the selected week before continuing.
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedMonday(prevMonday)}
                  className="text-xs font-bold underline whitespace-nowrap ml-3 shrink-0"
                >
                  Switch to {weekLabel(prevMonday)}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.title} className="card">
          <div className="card-hd"><div className="card-ti">{section.title}</div></div>
          <div className="card-body space-y-4">
            {section.fields.map((f) => (
              <div key={f.name}>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">{f.label}</label>
                <textarea
                  name={f.name}
                  className="field-input resize-none"
                  rows={f.rows}
                  placeholder={f.placeholder}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        type="submit"
        disabled={submitting || (!isAdmin && !lockedName)}
        className="btn-primary w-full sm:w-auto disabled:opacity-50"
      >
        {submitting ? <Spinner label="Submitting…" /> : 'Submit Weekly Report'}
      </button>
    </form>
  )
}
