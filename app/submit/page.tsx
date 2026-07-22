'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import { useMe } from '@/hooks/useMe'
import { FiCheck } from 'react-icons/fi'
import Spinner from '@/components/Spinner'
import WeekCalendar from '@/components/WeekCalendar'
import RichTextEditor from '@/components/RichTextEditor'
import { bucketFor } from '@/lib/due-buckets'
import { openTasksFor, dueDateTasksOnly, TASK_STATUS_LABELS, type TaskReviewStatus } from '@/lib/open-tasks'
import { htmlToSlackMrkdwn } from '@/lib/slack-format'
import type { ClickUpData } from '@/lib/types'

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
        label: '1. Beyond the open tasks listed above, is anything else blocked, stuck, or at risk right now?',
        rows: 4,
        placeholder: 'List each blocker separately.\nFormat: Blocker → Impact if unresolved → What\'s needed → From whom',
      },
      {
        name: 'escalations',
        label: '2. Is anything broken, behind, or needs to be escalated?',
        rows: 3,
        placeholder: 'If yes, use this format:\nThe problem in one sentence → Option A / Option B / Option C → your recommendation and why → what decision do you need from leadership?\n\nNever bring a problem without options — this keeps escalations to a 90-second decision.',
      },
    ],
  },
  {
    title: 'Next Week',
    fields: [
      {
        name: 'priorities',
        label: '3. What are your top 3–5 priorities for next week, in order — each with a specific date you\'re committing to?',
        rows: 5,
        placeholder: '"Soon" or "next week" is not a date — each priority needs a specific day (and time, if it matters).\nFormat: Priority → Date you commit to → Definition of done → Owner if team\n1.\n2.\n3.',
      },
    ],
  },
  {
    title: 'Last Week in Review',
    fields: [
      {
        name: 'goals_met',
        label: '4. Which of last week\'s priorities — including the open tasks listed above — did you complete, and what didn\'t get done, and why?',
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
        label: '9. What do you need from others to support you — including anyone blocking the open tasks listed above?',
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

  // ── "Your Open Tasks" — always scoped to whoever the report is being filed
  // for (yourself, or the admin's current dropdown pick). Never shows another
  // team member's tasks alongside it.
  const [clickupData, setClickUpData] = useState<ClickUpData | null>(null)
  const [teamRows, setTeamRows] = useState<Array<{ full_name: string; clickup_key: string | null }>>([])
  const [selectedName, setSelectedName] = useState<string>('')

  useEffect(() => {
    Promise.all([
      fetch('/api/clickup-tasks', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/team', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    ]).then(([cu, t]) => {
      setClickUpData(cu)
      setTeamRows(Array.isArray(t) ? t : [])
    })
  }, [])

  useEffect(() => {
    if (lockedName) setSelectedName(lockedName)
  }, [lockedName])

  const myOpenTasks = useMemo(() => {
    if (!selectedName || !clickupData?.tasksByAssignee) return []
    const member = teamRows.find(m => m.full_name === selectedName)
    return openTasksFor(clickupData.tasksByAssignee, member?.clickup_key, selectedName.split(' ')[0])
  }, [selectedName, clickupData, teamRows])

  // Tasks with no due date carry no accountability date, so they're dropped
  // entirely — every remaining task (soonest/most-overdue first, no cap)
  // gets a status + follow-up question.
  const topTasks = useMemo(() => dueDateTasksOnly(myOpenTasks), [myOpenTasks])

  const myOverdueCount = useMemo(
    () => topTasks.filter(t => bucketFor(t.dueTs) === 'overdue').length,
    [topTasks]
  )

  const [taskStatuses, setTaskStatuses] = useState<Record<string, { status: TaskReviewStatus | ''; note: string }>>({})

  // Every answer field uses the rich text editor (Slack has no HTML renderer,
  // so answers are converted to Slack mrkdwn client-side before submission —
  // the API/DB never see raw HTML).
  const [richValues, setRichValues] = useState<Record<string, string>>({})

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
    setRichValues({})
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
      // Rich-text fields are React-controlled, so restoring their hidden input's
      // DOM value alone wouldn't survive the next render — seed the editor state too.
      setRichValues(prev => ({ ...prev, ...data }))
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

    if (selectedMonday.getTime() > currentMonday.getTime()) {
      toast(`You can't submit a report for a future week (${weekLabel(selectedMonday)}).`)
      return
    }

    // Every listed open task needs a status; At Risk/Blocked ones need the follow-up answered.
    const missingStatus = topTasks.filter(t => !taskStatuses[t.id]?.status)
    if (missingStatus.length > 0) {
      toast(`Please select a status for each open task listed (missing: "${missingStatus[0].name}").`)
      return
    }
    const missingNote = topTasks.find(t => {
      const s = taskStatuses[t.id]?.status
      return (s === 'at_risk' || s === 'blocked') && !(taskStatuses[t.id]?.note ?? '').trim()
    })
    if (missingNote) {
      toast(`"${missingNote.name}" is At Risk/Blocked — please explain what's blocking it and a new date.`)
      return
    }

    const payload: Record<string, string> = {}
    for (const [k, v] of fd.entries()) {
      payload[k] = v as string
    }
    payload.week_start = weekStartISO(selectedMonday)
    payload.task_statuses = JSON.stringify(topTasks.map(t => ({
      id: t.id,
      status: taskStatuses[t.id]?.status || 'on_track',
      note: (taskStatuses[t.id]?.note ?? '').trim(),
    })))

    const CONTENT_FIELDS = ['blockers', 'escalations', 'priorities', 'goals_met', 'win', 'accomplishments', 'friction', 'went_well', 'support_needed']
    const isBlank = CONTENT_FIELDS.every(k => !(payload[k] ?? '').trim())
    if (isBlank) {
      toast('The weekly report is blank. Please complete the required fields before submitting.')
      return
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
        setRichValues({})
        setTaskStatuses({})
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
      <div className="flex items-center justify-between mt-6 mb-3">
        <div className="slbl !mt-0 !mb-0">Weekly Report</div>
        <Link href="/mochary-method" className="text-xs font-bold text-accent hover:underline whitespace-nowrap">
          Mochary Method reference →
        </Link>
      </div>
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
              <select
                name="name"
                className="field-input"
                required
                onChange={(e) => setSelectedName(e.target.value)}
              >
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
            <WeekCalendar selectedMonday={selectedMonday} onSelectWeek={setSelectedMonday} maxMonday={currentMonday} />
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

      {selectedName && (
        <div className="card">
          <div className="card-hd flex items-center justify-between">
            <div className="card-ti">0. Your Open Tasks</div>
            {myOverdueCount > 0 && <span className="badge-red">{myOverdueCount} overdue</span>}
          </div>
          <div className="card-body space-y-3">
            {topTasks.length === 0 ? (
              <div className="alert alert-green">No tasks with a due date right now — nice and clear.</div>
            ) : (
              topTasks.map((t) => {
                const overdue = bucketFor(t.dueTs) === 'overdue'
                const entry = taskStatuses[t.id]
                const needsNote = entry?.status === 'at_risk' || entry?.status === 'blocked'
                return (
                  <div key={t.id} className="border border-sand3 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`text-sm underline truncate ${overdue ? 'text-danger font-semibold' : 'text-ink2'}`}
                      >
                        {t.name}
                      </a>
                      <span className="text-xs whitespace-nowrap shrink-0 text-ink4">
                        Due {t.dueDate}{overdue ? ' · OVERDUE' : ''}
                      </span>
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-ink4 mb-2">
                      Owner: {selectedName}
                    </div>
                    <select
                      className="field-input text-sm"
                      value={entry?.status ?? ''}
                      onChange={(e) => {
                        const status = e.target.value as TaskReviewStatus | ''
                        setTaskStatuses((v) => ({ ...v, [t.id]: { status, note: v[t.id]?.note ?? '' } }))
                      }}
                    >
                      <option value="">— Status —</option>
                      {(Object.keys(TASK_STATUS_LABELS) as TaskReviewStatus[]).map((s) => (
                        <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    {needsNote && (
                      <textarea
                        className="field-input resize-none mt-2 text-sm"
                        rows={2}
                        placeholder="What's blocking it, specifically? What new date can you commit to? Is this blocked by another team member or team — who, and what do you need from them?"
                        value={entry?.note ?? ''}
                        onChange={(e) => {
                          const note = e.target.value
                          setTaskStatuses((v) => ({ ...v, [t.id]: { status: v[t.id]?.status ?? '', note } }))
                        }}
                      />
                    )}
                  </div>
                )
              })
            )}
            <p className="text-xs text-ink4">
              Only {isAdmin && selectedName !== me?.fullName ? `${selectedName}’s` : 'your'} own open tasks are shown here — this list, with the status and notes above, is posted to Slack automatically with the report. No one else&apos;s tasks are included.
            </p>
          </div>
        </div>
      )}

      {SECTIONS.map((section) => (
        <div key={section.title} className="card">
          <div className="card-hd"><div className="card-ti">{section.title}</div></div>
          <div className="card-body space-y-4">
            {section.fields.map((f) => (
              <div key={f.name}>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">{f.label}</label>
                <RichTextEditor
                  value={richValues[f.name] ?? ''}
                  onChange={(html) => setRichValues((v) => ({ ...v, [f.name]: html }))}
                  placeholder={f.placeholder}
                  minRows={f.rows}
                />
                {/* Slack has no HTML renderer — the field the API/DB/Slack see
                    is always plain Slack mrkdwn, never raw HTML. */}
                <input type="hidden" name={f.name} value={htmlToSlackMrkdwn(richValues[f.name] ?? '')} readOnly />
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
