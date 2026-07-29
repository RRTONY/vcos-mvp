'use client'

import { useState } from 'react'
import { List, type RowComponentProps } from 'react-window'
import type { ClickUpStatus, Task } from '@/lib/types'
import { bucketFor, DUE_BUCKET_META, type DueBucket } from '@/lib/due-buckets'

const ROW = 52
const MAX_H = 360

// Per-list status options, fetched once and shared across every row on the
// same list (ClickUp statuses are custom per-list, not global).
const listStatusCache = new Map<string, Promise<ClickUpStatus[]>>()
function fetchListStatuses(listId: string) {
  let promise = listStatusCache.get(listId)
  if (!promise) {
    promise = fetch(`/api/clickup-tasks/statuses?listId=${listId}`)
      .then(r => r.json())
      .then(d => (d.statuses ?? []) as ClickUpStatus[])
      .catch(() => [])
    listStatusCache.set(listId, promise)
  }
  return promise
}

type StatusChangeHandler = (taskId: string, status: string, closed: boolean) => void

// Colored status pill that becomes an editable dropdown of the task's list's
// real ClickUp statuses on click. Pushes the change straight to ClickUp.
function StatusPill({ task, onStatusChange }: { task: Task; onStatusChange: StatusChangeHandler }) {
  const [statuses, setStatuses] = useState<ClickUpStatus[] | null>(null)
  const [saving, setSaving] = useState(false)

  function loadStatuses() {
    if (statuses || !task.listId) return
    fetchListStatuses(task.listId).then(setStatuses)
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    if (newStatus === task.status) return
    setSaving(true)
    try {
      const res = await fetch(`/api/clickup-tasks/${task.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        const chosen = statuses?.find(s => s.status === newStatus)
        onStatusChange(task.id, newStatus, chosen?.type === 'closed')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!task.listId) {
    return task.status ? (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-sand2 text-ink3">{task.status}</span>
    ) : null
  }

  return (
    <select
      value={task.status}
      onFocus={loadStatuses}
      onClick={loadStatuses}
      onChange={handleChange}
      disabled={saving}
      className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 flex-shrink-0 border-0 cursor-pointer appearance-none disabled:opacity-50"
      style={{
        backgroundColor: task.statusColor ? `${task.statusColor}26` : undefined,
        color: task.statusColor || undefined,
      }}
    >
      <option value={task.status}>{task.status || '—'}</option>
      {(statuses ?? []).filter(s => s.status !== task.status).map(s => (
        <option key={s.status} value={s.status}>{s.status}</option>
      ))}
    </select>
  )
}

// Fixed-height virtualized task row.
function TaskRow({ index, style, tasks, onStatusChange }: RowComponentProps<{ tasks: Task[]; onStatusChange: StatusChangeHandler }>) {
  const t = tasks[index]
  const isUrgent = t.priority === 'urgent'
  const isHigh = t.priority === 'high'
  return (
    <div style={style} className="px-0.5">
      <div className="h-full flex items-center gap-3 border-b border-sand3 hover:bg-sand2 px-1 transition-colors group">
        {(isUrgent || isHigh) && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isUrgent ? 'bg-danger-light text-danger' : 'bg-warning-light text-warning'}`}>
            {isUrgent ? 'Urgent' : 'High'}
          </span>
        )}
        <a href={t.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium group-hover:text-accent leading-tight truncate">{t.name}</div>
            <div className="text-[11px] text-ink4 mt-0.5 truncate">{t.list}{t.dueDate ? ` · Due ${t.dueDate}` : ''}</div>
          </div>
          <span className="text-ink4 text-sm flex-shrink-0 group-hover:text-accent">↗</span>
        </a>
        <StatusPill task={t} onStatusChange={onStatusChange} />
      </div>
    </div>
  )
}

// Collapsible, virtualized bucket.
function Accordion({ label, dot, text, tasks, defaultOpen, onStatusChange }: {
  label: string; dot: string; text: string; tasks: Task[]; defaultOpen: boolean; onStatusChange: StatusChangeHandler
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-sand3 last:border-0">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-2 py-2.5 text-left hover:bg-sand2 -mx-1 px-1 rounded transition-colors">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span className={`text-[10px] font-bold uppercase tracking-widest ${text}`}>{label}</span>
        <span className="text-[10px] text-ink4">({tasks.length})</span>
        <span className="text-ink4 text-xs ml-auto">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="pb-2">
          <List rowComponent={TaskRow} rowCount={tasks.length} rowHeight={ROW} rowProps={{ tasks, onStatusChange }} style={{ height: Math.min(tasks.length * ROW, MAX_H) }} />
        </div>
      )}
    </div>
  )
}

/**
 * Groups a person's tasks into Overdue / Due Today / Due This Week / No Due Date
 * accordions, each a virtualized list. Shared by the dashboard Team Assignment
 * Board and the Open Loops page so they stay identical.
 */
export default function TaskBuckets({ tasks: initialTasks }: { tasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [prevInitial, setPrevInitial] = useState(initialTasks)
  if (initialTasks !== prevInitial) {
    setPrevInitial(initialTasks)
    setTasks(initialTasks)
  }

  const handleStatusChange: StatusChangeHandler = (taskId, status, closed) => {
    setTasks(prev => closed
      ? prev.filter(t => t.id !== taskId)
      : prev.map(t => t.id === taskId ? { ...t, status } : t))
  }

  if (tasks.length === 0) return <p className="text-sm text-ink3 py-3">No active tasks found in ClickUp.</p>

  const now = new Date()
  const groups: Record<DueBucket, Task[]> = { overdue: [], today: [], week: [] }
  const noDate: Task[] = []
  for (const t of tasks) {
    const b = bucketFor(t.dueTs, now)
    if (b) groups[b].push(t); else noDate.push(t)
  }
  // Display order: Due Today → Due This Week → Overdue → No Due Date.
  const order: DueBucket[] = ['today', 'week', 'overdue']
  const anyBucketed = order.some(b => groups[b].length > 0)
  const firstOpen = order.find(b => groups[b].length > 0) // open the top non-empty bucket

  return (
    <>
      {order.map(b => groups[b].length > 0 && (
        <Accordion key={b} label={DUE_BUCKET_META[b].label} dot={DUE_BUCKET_META[b].dot} text={DUE_BUCKET_META[b].text} tasks={groups[b]} defaultOpen={b === firstOpen} onStatusChange={handleStatusChange} />
      ))}
      {noDate.length > 0 && (
        <Accordion label="No Due Date" dot="bg-ink4" text="text-ink3" tasks={noDate} defaultOpen={!anyBucketed} onStatusChange={handleStatusChange} />
      )}
    </>
  )
}
