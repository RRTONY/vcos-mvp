'use client'

import { useEffect, useState } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import { ShareSlackButton } from '@/components/ShareButtons'
import { useMe } from '@/hooks/useMe'

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

function fmtWeek(mon: Date): string {
  const fri = new Date(mon)
  fri.setDate(mon.getDate() + 4)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(mon)}–${fmt(fri)}`
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
  filed: boolean
  filedWeek1: boolean
  filedWeek2: boolean
  btAlias: string | null   // null = N/A (no Braintrust expected)
  btFiled: boolean
}


export default function CompliancePage() {
  const { isAdmin, isOwner, me } = useMe()
  const [team, setTeam] = useState<Member[]>([])
  const [week1Label, setWeek1Label] = useState('Week 1')
  const [week2Label, setWeek2Label] = useState('Week 2')
  const [checks, setChecks] = useState<CheckState>({ invoiceSubmitted: false, webworkConfirmed: false, emailMeterConfirmed: false, slackReportConfirmed: false })
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
          filed: false, filedWeek1: false, filedWeek2: false,
          btAlias: m.bills_hours ? (m.braintrust_name ?? m.full_name.split(' ')[0].toLowerCase()) : null,
          btFiled: false,
        })))
      })
      .catch(() => {})
  }, [])



  function toggleCheck(key: keyof CheckState) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Filing status comes from the authoritative weekly_reports table (the submit
  // form writes there) — NOT the Slack channel scan, which was unreliable.
  useEffect(() => {
    const curMon = mostRecentMonday(new Date())
    const prevMon = new Date(curMon)
    prevMon.setDate(curMon.getDate() - 7)
    setWeek1Label(fmtWeek(prevMon))
    setWeek2Label(fmtWeek(curMon))
    const w1 = prevMon.toISOString().slice(0, 10)
    const w2 = curMon.toISOString().slice(0, 10)
    Promise.all([
      fetch(`/api/weekly-reports?week_start=${w1}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
      fetch(`/api/weekly-reports?week_start=${w2}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
    ]).then(([d1, d2]: [{ submitted_by: string }[], { submitted_by: string }[]]) => {
      const names1 = new Set((Array.isArray(d1) ? d1 : []).map((r) => r.submitted_by))
      const names2 = new Set((Array.isArray(d2) ? d2 : []).map((r) => r.submitted_by))
      setTeam((prev) =>
        prev.map((m) => ({
          ...m,
          filedWeek1: names1.has(m.name),
          filedWeek2: names2.has(m.name),
          filed: names2.has(m.name),
        }))
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
  const missing = visibleTeam.filter((m) => m.filesReport && !m.filed)
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
                <th className="text-left py-2 font-extrabold text-xs uppercase tracking-widest text-ink3">Team Member</th>
                <th className="text-left py-2 font-extrabold text-xs uppercase tracking-widest text-ink3 hidden sm:table-cell">Role</th>
                {isOwner && <th className="text-right py-2 font-extrabold text-xs uppercase tracking-widest text-ink3 hidden sm:table-cell">Rate</th>}
                <th className="text-center py-2 font-extrabold text-xs uppercase tracking-widest text-ink3">{week1Label}</th>
                <th className="text-center py-2 font-extrabold text-xs uppercase tracking-widest text-ink3">{week2Label}</th>
                <th className="text-center py-2 font-extrabold text-xs uppercase tracking-widest text-ink3 hidden sm:table-cell">Braintrust</th>
              </tr>
            </thead>
            <tbody>
              {visibleTeam.map((m) => {
                const rateColor = m.rate >= 90 ? 'text-ink' : m.rate >= 70 ? 'text-ink3' : 'text-ink4'
                return (
                  <tr key={m.name} className="border-b border-sand3 last:border-0">
                    <td className="py-2.5 font-bold">{m.name}</td>
                    <td className="py-2.5 text-ink3 text-xs hidden sm:table-cell">{m.role}</td>
                    {isOwner && <td className={`py-2.5 font-mono font-bold text-right hidden sm:table-cell ${rateColor}`}>{m.rate}%</td>}
                    <td className="py-2.5 text-center">
                      {m.filedWeek1
                        ? <span className="text-green-600 font-bold text-sm">✓</span>
                        : <span className="text-ink4 font-bold text-sm">✕</span>
                      }
                    </td>
                    <td className="py-2.5 text-center">
                      {m.filedWeek2
                        ? <span className="text-green-600 font-bold text-sm">✓</span>
                        : <span className="text-ink4 font-bold text-sm">✕</span>
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
            <div className="text-sm text-ink3">All team members have filed ✓</div>
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
            <div className="mt-3">
              <ShareSlackButton
                label="Alert Missing Members in Slack"
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
