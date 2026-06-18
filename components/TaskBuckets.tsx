'use client'

import { useState } from 'react'
import { List, type RowComponentProps } from 'react-window'
import type { Task } from '@/lib/types'
import { bucketFor, DUE_BUCKET_META, type DueBucket } from '@/lib/due-buckets'

const ROW = 52
const MAX_H = 360

// Fixed-height virtualized task row.
function TaskRow({ index, style, tasks }: RowComponentProps<{ tasks: Task[] }>) {
  const t = tasks[index]
  const isUrgent = t.priority === 'urgent'
  const isHigh = t.priority === 'high'
  return (
    <div style={style} className="px-0.5">
      <a href={t.url} target="_blank" rel="noopener noreferrer"
        className="h-full flex items-center gap-3 border-b border-sand3 hover:bg-sand2 px-1 transition-colors group">
        {(isUrgent || isHigh) && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isUrgent ? 'bg-danger-light text-danger' : 'bg-warning-light text-warning'}`}>
            {isUrgent ? 'Urgent' : 'High'}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium group-hover:text-accent leading-tight truncate">{t.name}</div>
          <div className="text-[11px] text-ink4 mt-0.5 truncate">{t.list}{t.dueDate ? ` · Due ${t.dueDate}` : ''}</div>
        </div>
        <span className="text-ink4 text-sm flex-shrink-0 group-hover:text-accent">↗</span>
      </a>
    </div>
  )
}

// Collapsible, virtualized bucket.
function Accordion({ label, dot, text, tasks, defaultOpen }: {
  label: string; dot: string; text: string; tasks: Task[]; defaultOpen: boolean
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
          <List rowComponent={TaskRow} rowCount={tasks.length} rowHeight={ROW} rowProps={{ tasks }} style={{ height: Math.min(tasks.length * ROW, MAX_H) }} />
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
export default function TaskBuckets({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return <p className="text-sm text-ink3 py-3">No active tasks found in ClickUp.</p>

  const now = new Date()
  const groups: Record<DueBucket, Task[]> = { overdue: [], today: [], week: [] }
  const noDate: Task[] = []
  for (const t of tasks) {
    const b = bucketFor(t.dueTs, now)
    if (b) groups[b].push(t); else noDate.push(t)
  }
  const order: DueBucket[] = ['overdue', 'today', 'week']
  const anyBucketed = order.some(b => groups[b].length > 0)

  return (
    <>
      {order.map(b => groups[b].length > 0 && (
        <Accordion key={b} label={DUE_BUCKET_META[b].label} dot={DUE_BUCKET_META[b].dot} text={DUE_BUCKET_META[b].text} tasks={groups[b]} defaultOpen={b === 'overdue'} />
      ))}
      {noDate.length > 0 && (
        <Accordion label="No Due Date" dot="bg-ink4" text="text-ink3" tasks={noDate} defaultOpen={!anyBucketed} />
      )}
    </>
  )
}
