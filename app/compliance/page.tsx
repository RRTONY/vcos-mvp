'use client'

import { useEffect, useState } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import { ShareSlackButton } from '@/components/ShareButtons'

interface Member {
  name: string
  role: string
  rate: number
  filed: boolean
  bt: string
}

const BASE_TEAM: Member[] = [
  { name: 'Rob Holmes', role: 'BD · Grants', rate: 91, filed: true, bt: 'Not integrated' },
  { name: 'Alex Veytsel', role: 'Equity Partner', rate: 82, filed: false, bt: 'Not integrated' },
  { name: 'Josh Bykowski', role: 'Legal · BD', rate: 73, filed: false, bt: 'Not integrated' },
  { name: 'Kim', role: 'Executive Ops', rate: 100, filed: true, bt: 'Narrative only' },
  { name: 'Chase', role: 'Executive Ops', rate: 100, filed: true, bt: 'Narrative only' },
  { name: 'Daniel Baez', role: 'Webmaster', rate: 100, filed: true, bt: 'N/A (new)' },
  { name: 'Ben Sheppard', role: 'ImpactSoul Contractor', rate: 0, filed: false, bt: 'First due Mar 23' },
  { name: 'Tony', role: 'CEO', rate: 0, filed: false, bt: 'N/A' },
]

const BT_CHECKS = [
  'Braintrust invoice submitted with link',
  'WebWork screenshots cover full work period',
  'Email Meter report submitted for this week',
  'Slack weekly report posted and linked',
  'Hours billed match WebWork within 0.5hr tolerance',
  'Alex approval confirmed before UBS money request',
]

export default function CompliancePage() {
  const [team, setTeam] = useState<Member[]>(BASE_TEAM)
  const [checked, setChecked] = useState<boolean[]>(BT_CHECKS.map(() => false))
  const [isAdmin, setIsAdmin] = useState(false)
  const { refreshKey } = useRefresh()

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null)
      .then(d => setIsAdmin(d?.role === 'admin'))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/slack-stats')
      .then((r) => r.json())
      .then((d) => {
        if (!d.weeklyReports) return
        const filed: string[] = d.weeklyReports.filed ?? []
        setTeam((prev) =>
          prev.map((m) => ({
            ...m,
            filed: filed.includes(m.name),
          }))
        )
      })
      .catch(() => {})
  }, [refreshKey])

  const missing = team.filter((m) => !m.filed && m.name !== 'Tony')

  return (
    <div>
      <div className="slbl mt-6">11-Week Compliance Scorecard — Jan 5 to Mar 16, 2026</div>

      <div className="card">
        <div className="card-hd">
          <div className="card-ti">Weekly Report Filing Rate</div>
          <span className="badge">11 weeks tracked</span>
        </div>
        <div className="card-body overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-sand3">
                <th className="text-left py-2 font-extrabold text-xs uppercase tracking-widest text-ink3">Team Member</th>
                <th className="text-left py-2 font-extrabold text-xs uppercase tracking-widest text-ink3">Role</th>
                {isAdmin && <th className="text-right py-2 font-extrabold text-xs uppercase tracking-widest text-ink3">Rate</th>}
                <th className="text-right py-2 font-extrabold text-xs uppercase tracking-widest text-ink3">This Week</th>
                <th className="text-left py-2 font-extrabold text-xs uppercase tracking-widest text-ink3 pl-4">Braintrust</th>
              </tr>
            </thead>
            <tbody>
              {team.map((m) => {
                const rateColor = m.rate >= 90 ? 'text-ink' : m.rate >= 70 ? 'text-ink3' : 'text-ink4'
                return (
                  <tr key={m.name} className="border-b border-sand3 last:border-0">
                    <td className="py-2.5 font-bold">{m.name}</td>
                    <td className="py-2.5 text-ink3 text-xs">{m.role}</td>
                    {isAdmin && <td className={`py-2.5 font-mono font-bold text-right ${rateColor}`}>{m.rate}%</td>}
                    <td className="py-2.5 text-right">
                      {m.filed
                        ? <span className="font-mono text-xs font-bold">● FILED</span>
                        : <span className="font-mono text-xs font-bold text-ink4">✕ MISSING</span>
                      }
                    </td>
                    <td className="py-2.5 text-xs text-ink3 pl-4">{m.bt}</td>
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
          <span className="text-xs text-ink3">Due Mar 18</span>
        </div>
        <div className="card-body">
          {BT_CHECKS.map((c, i) => (
            <div
              key={i}
              className="check-row"
              onClick={() => setChecked((prev) => prev.map((v, j) => (j === i ? !v : v)))}
            >
              <div className={`check-box ${checked[i] ? 'checked' : ''}`}>
                {checked[i] && <span className="text-sand text-[10px] font-bold">✓</span>}
              </div>
              <span className={`text-sm ${checked[i] ? 'line-through text-ink4' : ''}`}>{c}</span>
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
          {missing.length > 0 && (
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
