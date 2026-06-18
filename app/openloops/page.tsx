'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import { useMe } from '@/hooks/useMe'
import Avatar from '@/components/Avatar'
import Spinner from '@/components/Spinner'
import TaskBuckets from '@/components/TaskBuckets'
import { bucketFor } from '@/lib/due-buckets'
import type { ClickUpData, Task } from '@/lib/types'

interface TeamRow {
  full_name: string; vcos_username: string | null; clickup_key: string | null
  role_description: string | null; active: boolean
}

function lookup<T>(map: Record<string, T> | undefined, cuKey: string): T | null {
  if (!map || !cuKey) return null
  const k = Object.keys(map).find(x => x.includes(cuKey))
  return k ? map[k] : null
}

interface Person {
  name: string; role: string; cuKey: string; tasks: Task[]
  avatar: { image: string | null; initials: string | null; color: string | null } | null
  overdue: number
}

function PersonCard({ person, defaultOpen }: { person: Person; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card mb-2">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 px-3 sm:px-5 py-3 text-left hover:bg-sand2 transition-colors rounded-lg">
        <Avatar name={person.name} image={person.avatar?.image} initials={person.avatar?.initials} color={person.avatar?.color} className="w-9 h-9 text-sm" />
        <div className="flex-1 min-w-0">
          <span className="text-sm sm:text-base font-semibold">{person.name}</span>
          {person.role && <span className="hidden sm:inline text-sm text-ink4 ml-2">{person.role}</span>}
        </div>
        {person.overdue > 0 && <span className="badge-red">{person.overdue} overdue</span>}
        <span className="text-sm text-ink4 hidden sm:inline">{person.tasks.length} tasks</span>
        <span className="text-ink4 text-xs ml-0.5">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-sand3 px-5 py-1">
          <TaskBuckets tasks={person.tasks} />
        </div>
      )}
    </div>
  )
}

export default function OpenLoopsPage() {
  const { isAdmin, me } = useMe()
  const { refreshKey } = useRefresh()
  const [clickup, setClickUp] = useState<ClickUpData | null>(null)
  const [team, setTeam] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/clickup-tasks', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/team', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    ]).then(([cu, t]) => {
      setClickUp(cu)
      setTeam(Array.isArray(t) ? t.filter((m: TeamRow) => m.active) : [])
      setLoading(false)
    })
  }, [refreshKey])

  const people: Person[] = useMemo(() => {
    if (!clickup?.tasksByAssignee) return []
    const now = new Date()
    const rows = isAdmin ? team : team.filter(m => me?.fullName && m.full_name === me.fullName)
    return rows.map(m => {
      const cuKey = (m.clickup_key ?? m.full_name.split(' ')[0]).toLowerCase()
      const tasks = lookup(clickup.tasksByAssignee, cuKey) ?? []
      return {
        name: m.full_name,
        role: m.role_description ?? '',
        cuKey,
        tasks,
        avatar: lookup(clickup.assigneeAvatars, cuKey),
        overdue: tasks.filter(t => bucketFor(t.dueTs, now) === 'overdue').length,
      }
    }).filter(p => p.tasks.length > 0)
      .sort((a, b) => b.overdue - a.overdue || b.tasks.length - a.tasks.length)
  }, [clickup, team, isAdmin, me])

  const totalOverdue = people.reduce((s, p) => s + p.overdue, 0)
  const totalTasks = people.reduce((s, p) => s + p.tasks.length, 0)

  return (
    <div>
      <div className="flex items-center justify-between mt-6 mb-1">
        <h1 className="font-display text-xl tracking-widest">OPEN LOOPS</h1>
        {!loading && people.length > 0 && (
          <div className="flex gap-3 text-xs font-bold">
            {totalOverdue > 0 && <span className="text-red-600">{totalOverdue} overdue</span>}
            <span className="text-ink4">{totalTasks} open tasks</span>
          </div>
        )}
      </div>
      <p className="text-xs text-ink4 mb-4">
        {isAdmin ? 'Every team member’s' : 'Your'} open tasks, grouped by person and due date (Overdue · Due Today · Due This Week · No Due Date).
      </p>

      {loading ? (
        <div className="py-6"><Spinner label="Loading tasks…" className="text-ink4 text-sm" /></div>
      ) : people.length === 0 ? (
        <div className="border border-green-300 bg-green-50 p-4 text-sm font-bold text-green-800">
          ✓ No open tasks{!isAdmin && me?.fullName == null ? ' (your account isn’t linked to ClickUp)' : ''}.
        </div>
      ) : (
        people.map((p, i) => <PersonCard key={p.name} person={p} defaultOpen={i === 0} />)
      )}
    </div>
  )
}
