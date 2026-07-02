'use client'

import Spinner from '@/components/Spinner'
import PeopleAuditTable from '@/components/PeopleAuditTable'
import { useMemberAudit } from '@/hooks/useMemberAudit'

export default function WorkloadPage() {
  const { reportingAudit, loading } = useMemberAudit()

  return (
    <div className="mt-6">
      <h1 className="font-display text-xl tracking-widest mb-1">WORKLOAD</h1>
      <p className="text-xs text-ink4 mb-4">Weekly-report status, ClickUp load, and WebWork hours per person — same rollup used on Performance &rarr; People Audit.</p>

      {loading ? (
        <div className="py-6"><Spinner label="Loading workload…" className="text-ink4 text-sm" /></div>
      ) : reportingAudit.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink4">No team data available.</div>
      ) : (
        <PeopleAuditTable rows={reportingAudit} />
      )}
    </div>
  )
}
