'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import { classifySubmission, type SubmitStatus } from '@/lib/report-status'
import { getMondayOfWeekPT, weekStartISO } from '@/lib/week-utils'
import { lookupByAssignee } from '@/lib/assignee-lookup'
import type { ClickUpData, WebWorkMember } from '@/lib/types'

export interface AuditTeamRow {
  full_name: string
  vcos_username: string | null
  clickup_key: string | null
  role_description: string | null
  files_report: boolean
  active: boolean
}

export interface AuditReportRow {
  submitted_by: string
  created_at: string
  win?: string | null
  accomplishments?: string | null
  goals_met?: string | null
  priorities?: string | null
}

export interface MemberAudit {
  name: string
  username: string | null
  role: string
  cuKey: string
  status: SubmitStatus | null // null = not submitted
  report: AuditReportRow | null
  hours: number | null
  total: number
  overdue: number
  urgent: number
  avatar: { image: string | null; initials: string | null; color: string | null } | null
  filesReport: boolean
}

/**
 * Per-person rollup (weekly-report status + ClickUp load + WebWork hours),
 * shared by Performance's People Audit tab and the root Workload tab.
 */
export function useMemberAudit(enabled = true) {
  const { refreshKey } = useRefresh()
  const [team, setTeam] = useState<AuditTeamRow[]>([])
  const [clickup, setClickUp] = useState<ClickUpData | null>(null)
  const [webwork, setWebwork] = useState<WebWorkMember[]>([])
  const [reports, setReports] = useState<AuditReportRow[]>([])
  const [loading, setLoading] = useState(true)

  const weekMon = useMemo(() => getMondayOfWeekPT(), [])

  useEffect(() => {
    if (!enabled) return
    setLoading(true)
    const weekStart = weekStartISO(weekMon)
    Promise.all([
      fetch('/api/team', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
      fetch('/api/clickup-tasks', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/webwork', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(`/api/weekly-reports?week_start=${weekStart}`, { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    ]).then(([t, cu, ww, rep]) => {
      setTeam(Array.isArray(t) ? t.filter((m: AuditTeamRow) => m.active) : [])
      setClickUp(cu)
      setWebwork(ww?.members ?? [])
      setReports(Array.isArray(rep) ? rep : [])
      setLoading(false)
    })
  }, [enabled, weekMon, refreshKey])

  const audit: MemberAudit[] = useMemo(() => {
    return team.map(m => {
      const cuKey = (m.clickup_key ?? m.full_name.split(' ')[0]).toLowerCase()
      const report = reports.find(r => r.submitted_by === m.full_name)
        ?? reports.find(r => r.submitted_by.toLowerCase().includes(m.full_name.split(' ')[0].toLowerCase())) ?? null
      const stats = lookupByAssignee(clickup?.assigneeStats, cuKey)
      const ww = webwork.find(w => w.username.toLowerCase().includes(cuKey) || cuKey.includes(w.username.toLowerCase()))
      return {
        name: m.full_name,
        username: m.vcos_username,
        role: m.role_description ?? '',
        cuKey,
        status: report ? classifySubmission(report.created_at, weekMon) : null,
        report,
        hours: ww?.totalHours ?? null,
        total: stats?.total ?? 0,
        overdue: stats?.overdue ?? 0,
        urgent: stats?.urgent ?? 0,
        avatar: lookupByAssignee(clickup?.assigneeAvatars, cuKey),
        filesReport: m.files_report,
      }
    })
  }, [team, reports, clickup, webwork, weekMon])

  const reportingAudit = useMemo(() => audit.filter(a => a.filesReport), [audit])

  return { audit, reportingAudit, clickup, loading, weekMon }
}
