'use client'

import { useState, useRef } from 'react'
import { useToast } from '@/components/Toast'

const TEAM_NAMES = [
  'Rob Holmes',
  'Alex Veytsel',
  'Josh Bykowski',
  'Kim',
  'Chase',
  'Daniel Baez',
  'Ben Sheppard',
  'Tony',
]

const HOURS_MEMBERS = ['Rob Holmes', 'Alex Veytsel', 'Josh Bykowski', 'Ben Sheppard', 'Daniel Baez', 'Kim', 'Chase']

interface CheckState {
  invoiceSubmitted: boolean
  webworkConfirmed: boolean
  emailMeterConfirmed: boolean
  slackReportConfirmed: boolean
}

export default function SubmitPage() {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [checks, setChecks] = useState<CheckState>({
    invoiceSubmitted: false,
    webworkConfirmed: false,
    emailMeterConfirmed: false,
    slackReportConfirmed: false,
  })
  const [hours, setHours] = useState<Record<string, string>>({})
  const formRef = useRef<HTMLFormElement>(null)

  function toggleCheck(key: keyof CheckState) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function totalHours() {
    return Object.values(hours).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const name = fd.get('name') as string
    if (!name) { toast('Please select your name first'); return }

    const allChecked = Object.values(checks).every(Boolean)
    if (!allChecked) { toast('Complete all 4 Braintrust checklist items first'); return }

    const hoursObj: Record<string, number> = {}
    HOURS_MEMBERS.forEach((m, i) => {
      hoursObj[m] = parseFloat(fd.get(`hours_${i}`) as string) || 0
    })

    const payload = {
      name,
      week: fd.get('week') as string,
      outcomes: fd.get('outcomes') as string,
      goals: fd.get('goals') as string,
      deals: fd.get('deals') as string,
      relationships: fd.get('relationships') as string,
      priorities: fd.get('priorities') as string,
      blockers: fd.get('blockers') as string,
      win: fd.get('win') as string,
      braintrust: {
        ...checks,
        invoiceLink: fd.get('btLink') as string,
        webworkLink: fd.get('wwLink') as string,
        emailMeterLink: fd.get('emLink') as string,
        slackReportLink: fd.get('slLink') as string,
      },
      hours: hoursObj,
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
        setSubmitted(true)
        toast(`✓ Report submitted for ${name}`)
        setTimeout(() => {
          formRef.current?.reset()
          setChecks({ invoiceSubmitted: false, webworkConfirmed: false, emailMeterConfirmed: false, slackReportConfirmed: false })
          setHours({})
          setSubmitted(false)
        }, 3000)
      } else {
        toast(`Submit failed: ${data.error ?? 'Unknown error'}`)
      }
    } catch {
      toast('Network error — check connection')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <div className="slbl mt-6">Weekly Report Submission</div>
      <div className="alert alert-amber">All fields required for payroll to process. No dollar amounts — hours only.</div>

      <div className="card">
        <div className="card-hd"><div className="card-ti">Your Information</div></div>
        <div className="card-body space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">Your Name</label>
            <select name="name" className="field-input">
              <option value="">— Select —</option>
              {TEAM_NAMES.map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">Report Week</label>
            <input name="week" className="field-input" type="text" defaultValue="Mar 9–16, 2026" placeholder="e.g. Mar 9–16, 2026" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd"><div className="card-ti">Business Outcomes</div></div>
        <div className="card-body space-y-4">
          {[
            { name: 'outcomes', label: '1. What business outcomes did you drive this week?', rows: 4, placeholder: 'Deals advanced, deliverables shipped, relationships nurtured...' },
            { name: 'goals', label: '2. Did you accomplish your top goals from last week? If not, why not?', rows: 3, placeholder: 'Yes / No — with explanation...' },
            { name: 'deals', label: '3. Deals Closed / Verbaled / Accomplished', rows: 2, placeholder: 'Any signed agreements, verbal commitments, milestones...' },
            { name: 'relationships', label: '4. Key Relationships Nurtured', rows: 2, placeholder: 'Names and context...' },
            { name: 'priorities', label: '5. Top 3–5 Priorities for Next Week', rows: 3, placeholder: 'Be specific and measurable...' },
            { name: 'blockers', label: '6. Help Needed / Blockers', rows: 2, placeholder: 'What do you need from Tony, Alex, Kim?' },
          ].map((f) => (
            <div key={f.name}>
              <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">{f.label}</label>
              <textarea name={f.name} className="field-input resize-none" rows={f.rows} placeholder={f.placeholder} />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">7. Win of the Week</label>
            <input name="win" className="field-input" type="text" placeholder="One sentence..." />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-ti">Braintrust Compliance</div>
          <span className="badge-red">Required for Payroll</span>
        </div>
        <div className="card-body space-y-3">
          {([
            { key: 'invoiceSubmitted', label: 'Braintrust invoice submitted this period?', urlName: 'btLink', placeholder: 'Paste Braintrust invoice URL...' },
            { key: 'webworkConfirmed', label: 'WebWork screenshots cover full work period?', urlName: 'wwLink', placeholder: 'Paste WebWork screenshot link or folder URL...' },
            { key: 'emailMeterConfirmed', label: 'Email Meter report submitted for this week?', urlName: 'emLink', placeholder: 'Paste Email Meter report link...' },
            { key: 'slackReportConfirmed', label: 'Slack weekly report posted and linked in #weeklyreports?', urlName: 'slLink', placeholder: 'Paste Slack message permalink...' },
          ] as { key: keyof CheckState; label: string; urlName: string; placeholder: string }[]).map((item) => (
            <div key={item.key}>
              <div className="check-row" onClick={() => toggleCheck(item.key)}>
                <div className={`check-box ${checks[item.key] ? 'checked' : ''}`}>
                  {checks[item.key] && <span className="text-sand text-[10px] font-bold">✓</span>}
                </div>
                <span className={`text-sm ${checks[item.key] ? 'line-through text-ink4' : ''}`}>{item.label}</span>
              </div>
              <div className="pl-6">
                <input name={item.urlName} className="field-input text-xs" type="url" placeholder={item.placeholder} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-ti">Hours Billed This Period</div>
          <span className="badge">No dollar amounts</span>
        </div>
        <div className="card-body">
          <div className="alert alert-amber mb-4 text-xs">Hours only. Must match WebWork within 0.5hr tolerance. Do not include rates or dollar amounts.</div>
          <div className="space-y-2">
            {HOURS_MEMBERS.map((member, i) => (
              <div key={member} className="flex items-center gap-3">
                <span className="text-sm font-bold w-32 flex-shrink-0">{member}</span>
                <input
                  name={`hours_${i}`}
                  className="field-input w-24 text-right font-mono"
                  type="number"
                  min="0"
                  max="200"
                  step="0.5"
                  placeholder="0"
                  value={hours[member] ?? ''}
                  onChange={(e) => setHours((h) => ({ ...h, [member]: e.target.value }))}
                />
                <span className="text-xs text-ink3">hrs</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-sand3">
            <span className="text-xs font-bold uppercase tracking-widest text-ink3">Total Hours</span>
            <span className="font-serif font-black text-2xl">{totalHours().toFixed(1)} hrs</span>
          </div>
        </div>
      </div>

      {submitted && (
        <div className="bg-ink text-sand p-4 text-sm font-bold mb-4">
          ✓ Report submitted successfully — Slack notified
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary w-full sm:w-auto disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit Weekly Report'}
      </button>
    </form>
  )
}
