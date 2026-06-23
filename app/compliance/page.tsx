'use client'

import { useEffect, useState } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import { ShareSlackButton } from '@/components/ShareButtons'
import { useMe } from '@/hooks/useMe'
import { useToast } from '@/components/Toast'
import { memberFiled } from '@/lib/report-match'
import { reportDeadlinePassed } from '@/lib/report-status'

interface CheckState {
  invoiceSubmitted: boolean
  webworkConfirmed: boolean
  emailMeterConfirmed: boolean
  slackReportConfirmed: boolean
}

const SCORECARD_WEEKS = 11

function getScorecardRange(): { label: string; weeksLabel: string } {
  const now = new Date()
  const daysSinceFriday = (now.getDay() + 2) % 7
  const endFriday = new Date(now)
  endFriday.setDate(now.getDate() - daysSinceFriday)
  const startDate = new Date(endFriday)
  startDate.setDate(endFriday.getDate() - (SCORECARD_WEEKS - 1) * 7)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return {
    label: `${fmt(startDate)} to ${fmt(endFriday)}`,
    weeksLabel: `${SCORECARD_WEEKS} weeks tracked`,
  }
}

function mostRecentMonday(from: Date): Date {
  const d = new Date(from)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

const BT_ITEMS: { key: keyof CheckState; label: string }[] = [
  { key: 'invoiceSubmitted',    label: 'Braintrust invoice submitted this period?' },
  { key: 'webworkConfirmed',    label: 'WebWork screenshots cover full work period?' },
  { key: 'emailMeterConfirmed', label: 'Email Meter report submitted for this week?' },
  { key: 'slackReportConfirmed',label: 'Slack weekly report posted and linked in #weeklyreports?' },
]

interface Member {
  name: string
  role: string
  rate: number
  filesReport: boolean
  filed: boolean            // filed for the most recent week (drives Exception Report)
  filedByWeek: boolean[]    // one entry per scorecard week, oldest → newest
  btAlias: string | null    // null = N/A (no Braintrust expected)
  btFiled: boolean
}


export default function CompliancePage() {
  const { isAdmin, isOwner, me } = useMe()
  const { toast } = useToast()
  const [team, setTeam] = useState<Member[]>([])
  const [weekCols, setWeekCols] = useState<{ key: string; label: string }[]>([])
  const [checks, setChecks] = useState<CheckState>({ invoiceSubmitted: false, webworkConfirmed: false, emailMeterConfirmed: false, slackReportConfirmed: false })
  const [reminding, setReminding] = useState(false)
  const { refreshKey } = useRefresh()

  // Load team from DB on mount
  useEffect(() => {
    fetch('/api/team', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: Array<{ full_name: string; role_description: string | null; hourly_rate: number; braintrust_name: string | null; bills_hours: boolean; active: boolean; files_report: boolean }>) => {
        const active = (data ?? []).filter(m => m.active)
        setTeam(active.map(m => ({
          name: m.full_name,
          role: m.role_description ?? '',
          rate: m.hourly_rate ?? 0,
          filesReport: m.files_report,
          filed: false, filedByWeek: [],
          btAlias: m.bills_hours ? (m.braintrust_name ?? m.full_name.split(' ')[0].toLowerCase()) : null,
          btFiled: false,
        })))
      })
      .catch(() => {})
  }, [])



  function toggleCheck(key: keyof CheckState) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function sendReminders(names: string[]) {
    if (!names.length) return
    setReminding(true)
    try {
      const res = await fetch('/api/compliance/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      })
      const d = await res.json()
      if (!res.ok) { toast(`Reminder failed: ${d.error ?? 'error'}`); return }
      const dmed = d.dmed?.length ?? 0
      const skipped = d.skipped?.length ?? 0
      toast(
        dmed > 0
          ? `✓ DM sent to ${dmed} member${dmed !== 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} had no Slack match` : ''}`
          : `No DMs sent — ${skipped} member${skipped !== 1 ? 's' : ''} had no Slack match. Use the channel alert instead.`
      )
    } catch {
      toast('Network error sending reminders')
    } finally {
      setReminding(false)
    }
  }

  // Filing status comes from the authoritative weekly_reports table (the submit
  // form writes there) — NOT the Slack channel scan, which was unreliable. The
  // same fuzzy name-matcher the dashboard uses (memberFiled) keeps the two views
  // in agreement. We fetch the full SCORECARD_WEEKS history (oldest → newest).
  useEffect(() => {
    const curMon = mostRecentMonday(new Date())
    const mondays = Array.from({ length: SCORECARD_WEEKS }, (_, i) => {
      const mon = new Date(curMon)
      mon.setDate(curMon.getDate() - (SCORECARD_WEEKS - 1 - i) * 7)
      return mon
    })
    setWeekCols(mondays.map(mon => ({
      key: mon.toISOString().slice(0, 10),
      label: mon.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
    })))

    Promise.all(
      mondays.map(mon =>
        fetch(`/api/weekly-reports?week_start=${mon.toISOString().slice(0, 10)}`, { cache: 'no-store' })
          .then(r => r.json())
          .catch(() => [])
      )
    ).then((weekly: { submitted_by: string }[][]) => {
      const weeks = weekly.map(w => (Array.isArray(w) ? w : []))
      setTeam((prev) =>
        prev.map((m) => {
          const filedByWeek = weeks.map(w => memberFiled(w, m.name))
          return {
            ...m,
            filedByWeek,
            filed: filedByWeek[filedByWeek.length - 1] ?? false,
          }
        })
      )
    }).catch(() => {})
  }, [refreshKey])

  useEffect(() => {
    fetch('/api/invoices', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const invoices: { contractor: string }[] = d.invoices ?? []
        setTeam((prev) =>
          prev.map((m) => {
            if (!m.btAlias) return m
            const btFiled = invoices.some((inv) =>
              inv.contractor.toLowerCase().includes(m.btAlias!)
            )
            return { ...m, btFiled }
          })
        )
      })
      .catch(() => {})
  }, [refreshKey])

  // Normal users only see their own row (consistent with report visibility rules);
  // managers see the full team.
  const visibleTeam = isAdmin ? team : team.filter((m) => me?.fullName && m.name === me.fullName)
  // A report is only "missing" once Friday has passed; before then it's pending.
  const deadlinePassed = reportDeadlinePassed(mostRecentMonday(new Date()))
  const missing = deadlinePassed ? visibleTeam.filter((m) => m.filesReport && !m.filed) : []
  const pending = !deadlinePassed ? visibleTeam.filter((m) => m.filesReport && !m.filed) : []
  const { label: scorecardRange, weeksLabel } = getScorecardRange()

  return (
    <div>
      <div className="slbl mt-6">Compliance Scorecard — {scorecardRange}</div>

      <div className="card">
        <div className="card-hd">
          <div className="card-ti">Weekly Report Filing Rate</div>
          <span className="badge">{weeksLabel}</span>
        </div>
        <div className="card-body overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-sand3">
                <th className="text-left py-2 font-extrabold text-xs uppercase tracking-widest text-ink3 sticky left-0 bg-surface">Team Member</th>
                <th className="text-left py-2 font-extrabold text-xs uppercase tracking-widest text-ink3 hidden sm:table-cell">Role</th>
                {isOwner && <th className="text-right py-2 px-2 font-extrabold text-xs uppercase tracking-widest text-ink3 hidden sm:table-cell">Rate</th>}
                {weekCols.map(c => (
                  <th key={c.key} className="text-center py-2 px-1 font-extrabold text-[10px] font-mono text-ink3 whitespace-nowrap" title={c.key}>{c.label}</th>
                ))}
                <th className="text-center py-2 px-2 font-extrabold text-xs uppercase tracking-widest text-ink3">Filed</th>
                <th className="text-center py-2 font-extrabold text-xs uppercase tracking-widest text-ink3 hidden sm:table-cell">Braintrust</th>
              </tr>
            </thead>
            <tbody>
              {visibleTeam.map((m) => {
                const rateColor = m.rate >= 90 ? 'text-ink' : m.rate >= 70 ? 'text-ink3' : 'text-ink4'
                const filedCount = m.filedByWeek.filter(Boolean).length
                const totalWeeks = m.filedByWeek.length || weekCols.length
                const ratePct = totalWeeks > 0 ? filedCount / totalWeeks : 0
                const filedColor = ratePct >= 0.8 ? 'text-green-600' : ratePct >= 0.5 ? 'text-amber-600' : 'text-red-600'
                return (
                  <tr key={m.name} className="border-b border-sand3 last:border-0">
                    <td className="py-2.5 font-bold sticky left-0 bg-surface">{m.name}</td>
                    <td className="py-2.5 text-ink3 text-xs hidden sm:table-cell">{m.role}</td>
                    {isOwner && <td className={`py-2.5 px-2 font-mono font-bold text-right hidden sm:table-cell ${rateColor}`}>{m.rate}%</td>}
                    {weekCols.map((c, i) => {
                      const isCurrentWeek = i === weekCols.length - 1
                      const pendingCell = isCurrentWeek && !deadlinePassed && !m.filedByWeek[i]
                      return (
                        <td key={c.key} className="py-2.5 px-1 text-center">
                          {!m.filesReport
                            ? <span className="text-ink4 text-xs">—</span>
                            : m.filedByWeek[i]
                              ? <span className="text-green-600 font-bold text-sm">✓</span>
                              : pendingCell
                                ? <span className="text-amber-500 font-bold text-sm" title="Pending — due Friday">·</span>
                                : <span className="text-ink4 font-bold text-sm">✕</span>
                          }
                        </td>
                      )
                    })}
                    <td className="py-2.5 px-2 text-center">
                      {m.filesReport
                        ? <span className={`font-mono font-bold text-xs ${filedColor}`}>{filedCount}/{totalWeeks}</span>
                        : <span className="text-ink4 text-xs">—</span>
                      }
                    </td>
                    <td className="py-2.5 text-center hidden sm:table-cell">
                      {m.btAlias === null
                        ? <span className="text-ink4 text-xs">—</span>
                        : m.btFiled
                          ? <span className="text-green-600 font-bold text-sm">✓</span>
                          : <span className="text-ink4 font-bold text-sm">✕</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="slbl">Braintrust Compliance Checklist</div>
      <div className="card">
        <div className="card-hd">
          <div className="card-ti">Pre-Payroll Gate</div>
          <span className="badge-red">Required for Payroll</span>
        </div>
        <div className="card-body space-y-3">
          {BT_ITEMS.map((item) => (
            <div key={item.key} className="check-row" onClick={() => toggleCheck(item.key)}>
              <div className={`check-box ${checks[item.key] ? 'checked' : ''}`}>
                {checks[item.key] && <span className="text-sand text-[10px] font-bold">✓</span>}
              </div>
              <span className={`text-sm ${checks[item.key] ? 'line-through text-ink4' : ''}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="slbl">Exception Report</div>
      <div className="card">
        <div className="card-hd">
          <div className="card-ti">Missing This Week</div>
          {missing.length > 0 && <span className="badge-red">Action Required</span>}
        </div>
        <div className="card-body">
          {missing.length === 0 ? (
            !deadlinePassed && pending.length > 0
              ? <div className="text-sm text-ink3">{pending.length} report{pending.length > 1 ? 's' : ''} pending — due Friday. Not overdue yet.</div>
              : <div className="text-sm text-ink3">All team members have filed ✓</div>
          ) : (
            missing.map((m) => (
              <div key={m.name} className="flex items-center justify-between py-2.5 border-b border-sand3 last:border-0">
                <div>
                  <div className="text-sm font-bold">{m.name}</div>
                  <div className="text-xs text-ink3">{m.role}</div>
                </div>
                <span className="badge-red text-xs">Missing</span>
              </div>
            ))
          )}
          {missing.length > 0 && isAdmin && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => sendReminders(missing.map(m => m.name))}
                disabled={reminding}
                className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
                title="Send each missing member a personalized Slack DM"
              >
                {reminding ? 'Sending…' : 'DM Missing Members'}
              </button>
              <ShareSlackButton
                label="Alert in Channel"
                message={[
                  `⚠️ *Weekly Report — Missing Submissions*`,
                  missing.map(m => `• ${m.name} (${m.role})`).join('\n'),
                  `Please submit your report in VCOS today.`,
                ].join('\n')}
              />
            </div>
          )}
          <div className="mt-3 text-xs text-ink3">
            Full exception report:{' '}
            <a href="https://app.clickup.com/10643959/docs/a4ufq-50671" target="_blank" className="underline">
              ClickUp Doc ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
