'use client'

import { useEffect, useState } from 'react'
import { FiCheck, FiChevronLeft, FiChevronRight, FiAlertTriangle } from 'react-icons/fi'
import { useMe } from '@/hooks/useMe'
import { useToast } from '@/components/Toast'
import Spinner from '@/components/Spinner'
import RichTextEditor from '@/components/RichTextEditor'
import type { MeetingPrepRow } from '@/lib/types'
import {
  nextMeetingDate, adjacentMeetingDate, meetingDeadlinePassed,
  fmtMeetingDate, fmtDeadline, meetingDateISO, meetingTypeOf,
  MEETING_PREP_CATEGORIES, type MeetingFieldKey,
} from '@/lib/meeting-prep'

const EMPTY_FIELDS: Record<MeetingFieldKey, string> = { wins: '', priorities: '', blockers: '', decisions: '', fyis: '' }

/**
 * Submission-only page for the Mochary-method pre-meeting update. Review
 * (submission status + per-person breakdown for leadership) lives on the
 * Reports page's "Team Meeting" tab — this page is just the form, reached
 * from there via "Submit now" / "Edit update".
 */
export default function MeetingPrepPage() {
  const { me, isAdmin } = useMe()
  const { toast } = useToast()

  const [meetingDate, setMeetingDate] = useState<Date>(() => nextMeetingDate())
  const [participantNames, setParticipantNames] = useState<string[]>([])
  const [selectedName, setSelectedName] = useState('')
  const [fields, setFields] = useState<Record<MeetingFieldKey, string>>(EMPTY_FIELDS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const lockedName = !isAdmin ? (me?.fullName ?? null) : null
  const activeName = lockedName ?? selectedName
  const iso = meetingDateISO(meetingDate)
  const deadlinePassed = meetingDeadlinePassed(meetingDate)
  const locked = deadlinePassed && !isAdmin
  const isCurrentMeeting = iso === meetingDateISO(nextMeetingDate())

  useEffect(() => {
    fetch('/api/team', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: Array<{ full_name: string; active: boolean }>) => {
        const names = (data ?? []).filter(m => m.active).map(m => m.full_name)
        // Leadership isn't a meeting participant expected to file an update.
        setParticipantNames(names.filter(n => n !== me?.fullName))
      })
      .catch(() => {})
  }, [me?.fullName])

  useEffect(() => {
    if (lockedName) { setSelectedName(lockedName); return }
    if (!selectedName && participantNames.length > 0) setSelectedName(participantNames[0])
  }, [lockedName, participantNames, selectedName])

  useEffect(() => {
    if (!activeName) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/meeting-prep?meeting_date=${iso}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((data: MeetingPrepRow[]) => {
        const mine = Array.isArray(data) ? data.find(s => s.submitted_by === activeName) : null
        setFields(mine ? {
          wins: mine.wins ?? '',
          priorities: mine.priorities ?? '',
          blockers: mine.blockers ?? '',
          decisions: mine.decisions ?? '',
          fyis: mine.fyis ?? '',
        } : EMPTY_FIELDS)
      })
      .catch(() => setFields(EMPTY_FIELDS))
      .finally(() => setLoading(false))
  }, [iso, activeName])

  async function handleSave() {
    if (!activeName) { toast('Please select a name first'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/meeting-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: activeName, meeting_date: iso, ...fields }),
      })
      const data = await res.json()
      if (data.success) {
        toast(`Update saved for ${activeName}`)
      } else {
        toast(`Save failed: ${data.error ?? 'Unknown error'}`)
      }
    } catch {
      toast('Network error — check connection')
    } finally {
      setSaving(false)
    }
  }

  const meetingLabel = `${meetingTypeOf(meetingDate) === 'monday' ? 'Monday' : 'Thursday'} Leadership Meeting`

  return (
    <div>
      <div className="slbl mt-6">Team Meeting Prep</div>
      <p className="text-sm text-ink3 mb-4">
        Submit a short pre-meeting update before every Monday and Thursday leadership meeting — following the Mochary Method, updates are reviewed in advance so meeting time goes to discussion, decisions, and blockers, not status reads.
      </p>

      {/* Meeting navigator */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 mb-4">
        <button
          onClick={() => setMeetingDate(d => adjacentMeetingDate(d, -1))}
          className="text-ink4 hover:text-ink text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-sand3 transition-colors"
          title="Previous meeting"
        ><FiChevronLeft /></button>
        <span className="text-sm font-semibold">{meetingLabel} — {fmtMeetingDate(meetingDate)}</span>
        <button
          onClick={() => setMeetingDate(d => adjacentMeetingDate(d, 1))}
          className="text-ink4 hover:text-ink text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-sand3 transition-colors"
          title="Next meeting"
        ><FiChevronRight /></button>
        {!isCurrentMeeting && (
          <button onClick={() => setMeetingDate(nextMeetingDate())} className="text-xs text-accent hover:underline">
            Jump to current meeting
          </button>
        )}
        <span className={`text-xs font-semibold ml-2 ${deadlinePassed ? 'text-ink4' : 'text-warning'}`}>
          {deadlinePassed ? `Submissions closed (were due ${fmtDeadline(meetingDate)})` : `Due ${fmtDeadline(meetingDate)} EOD`}
        </span>
      </div>

      {locked && (
        <div className="alert alert-amber items-center">
          <FiAlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>The submission deadline for this meeting has passed — your update is now read-only.</span>
        </div>
      )}

      <div className="card">
        <div className="card-hd">
          <div className="card-ti">Your Update</div>
        </div>
        <div className="card-body space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">Name</label>
            {isAdmin ? (
              <select value={selectedName} onChange={e => setSelectedName(e.target.value)} className="field-input" disabled={locked}>
                {participantNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : lockedName ? (
              <div className="field-input bg-sand2">
                <span className="font-semibold">{lockedName}</span>
              </div>
            ) : (
              <div className="text-sm text-danger">
                Your account isn&apos;t linked to a team member, so you can&apos;t submit an update. Please contact an admin.
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-4"><Spinner label="Loading…" className="text-ink4 text-sm" /></div>
          ) : (
            <>
              {MEETING_PREP_CATEGORIES.map(cat => (
                <div key={cat.key}>
                  <label className="text-xs font-bold uppercase tracking-widest text-ink3 flex items-center gap-1.5 mb-1">
                    <cat.Icon className="w-3.5 h-3.5" />
                    {cat.title} {cat.optional && <span className="normal-case font-medium text-ink4">(Optional)</span>}
                  </label>
                  <p className="text-xs text-ink4 mb-1.5">{cat.prompt}</p>
                  <RichTextEditor
                    value={fields[cat.key]}
                    onChange={html => setFields(f => ({ ...f, [cat.key]: html }))}
                    placeholder="Type your update…"
                    disabled={locked || (!isAdmin && !lockedName)}
                  />
                </div>
              ))}

              <button
                onClick={handleSave}
                disabled={saving || locked || (!isAdmin && !lockedName)}
                className="btn-primary w-full sm:w-auto disabled:opacity-50"
              >
                {saving ? <Spinner label="Saving…" /> : <><FiCheck className="inline w-4 h-4 mr-1" />Save Update</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
