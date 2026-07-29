'use client'

import { useEffect, useState } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import Avatar from '@/components/Avatar'
import Spinner from '@/components/Spinner'
import StaleBadge from '@/components/StaleBadge'
import type { ProjectBreakdown } from '@/lib/types'

interface TeamRow {
  full_name: string; vcos_username: string | null; clickup_key: string | null; active: boolean
}

function displayName(username: string, team: TeamRow[]): string {
  const key = username.toLowerCase()
  const match = team.find(m =>
    (m.vcos_username ?? '').toLowerCase() === key
    || (m.clickup_key ?? m.full_name.split(' ')[0]).toLowerCase() === key
  )
  return match?.full_name ?? username
}

function MemberRow({ member, team }: { member: ProjectBreakdown['members'][number]; team: TeamRow[] }) {
  const [open, setOpen] = useState(false)
  const name = displayName(member.username, team)
  return (
    <div className="border-b border-sand3 last:border-0">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-2 py-2 text-left hover:bg-sand2 -mx-1 px-1 rounded transition-colors">
        <Avatar name={name} className="w-6 h-6 text-[10px]" />
        <span className="text-sm font-medium flex-1 truncate">{name}</span>
        <span className="text-xs font-mono text-ink3">{member.hours}h</span>
        <span className="text-ink4 text-[10px] ml-1">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="pl-8 pb-2 space-y-1">
          {member.tasks.map(t => (
            <div key={t.task} className="flex items-center justify-between gap-2 text-xs text-ink3">
              <span className="truncate">{t.task}</span>
              <span className="font-mono text-ink4 flex-shrink-0">{t.hours}h</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project, team, defaultOpen }: { project: ProjectBreakdown; team: TeamRow[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card mb-2">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-sand2 transition-colors rounded-lg">
        <span className="text-sm sm:text-base font-semibold flex-1 truncate">{project.project}</span>
        <span className="text-xs text-ink4 hidden sm:inline">{project.members.length} {project.members.length === 1 ? 'person' : 'people'}</span>
        <span className="text-xs font-mono text-ink3">{project.hours}h this week</span>
        <span className="text-ink4 text-xs ml-1">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-sand3 px-4 sm:px-5 py-1">
          {project.members.map(m => <MemberRow key={m.username} member={m} team={team} />)}
        </div>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  const { refreshKey } = useRefresh()
  const [projects, setProjects] = useState<ProjectBreakdown[]>([])
  const [team, setTeam] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()
  const [ageMinutes, setAgeMinutes] = useState<number | undefined>()
  const [circuitOpen, setCircuitOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/webwork', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/team', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    ]).then(([ww, t]) => {
      setProjects(ww?.projects ?? [])
      setError(ww?.error)
      setAgeMinutes(ww?._ageMinutes)
      setCircuitOpen(!!ww?._circuitOpen)
      setTeam(Array.isArray(t) ? t.filter((m: TeamRow) => m.active) : [])
      setLoading(false)
    })
  }, [refreshKey])

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="font-display text-xl tracking-widest">PROJECTS</h1>
        <StaleBadge ageMinutes={ageMinutes} circuitOpen={circuitOpen} error={projects.length === 0 ? error : undefined} />
      </div>
      <p className="text-xs text-ink4 mb-4">What the team is logging time against this week in WebWork, grouped by project.</p>

      {loading ? (
        <div className="py-6"><Spinner label="Loading projects…" className="text-ink4 text-sm" /></div>
      ) : projects.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink4">{error ?? 'No WebWork activity logged this week.'}</div>
      ) : (
        projects.map((p, i) => <ProjectCard key={p.project} project={p} team={team} defaultOpen={i === 0} />)
      )}
    </div>
  )
}
