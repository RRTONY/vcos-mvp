// Shared "this person's open ClickUp tasks" lookup — used by Open Loops and
// the weekly report's "Your Open Tasks" section. Always scoped to a single
// assignee; never returns another team member's tasks.
import { bucketFor } from './due-buckets'
import type { Task } from './types'

/** Find the tasksByAssignee key that matches a ClickUp key (usernames are
 *  stored lowercased and may include extra suffixes, so we match by substring
 *  the same way Open Loops does). */
export function findAssigneeKey(map: Record<string, unknown> | undefined, cuKey: string): string | null {
  if (!map || !cuKey) return null
  return Object.keys(map).find(k => k.includes(cuKey)) ?? null
}

/** This person's open tasks only — looked up by their ClickUp key (falling
 *  back to their first name if no key is configured). */
export function openTasksFor(
  tasksByAssignee: Record<string, Task[]> | undefined,
  clickupKey: string | null | undefined,
  fallbackFirstName: string
): Task[] {
  const cuKey = (clickupKey || fallbackFirstName || '').toLowerCase()
  const key = findAssigneeKey(tasksByAssignee, cuKey)
  return key ? tasksByAssignee![key] : []
}

export function overdueOf(tasks: Task[], now: Date = new Date()): Task[] {
  return tasks.filter(t => bucketFor(t.dueTs, now) === 'overdue')
}

/** Tasks with no due date carry no accountability date, so the weekly report's
 *  "Your Open Tasks" section drops them entirely — only tasks with a real due
 *  date are shown, soonest/most-overdue first, capped to the top 10. */
export function topDueTasks(tasks: Task[], limit = 10): Task[] {
  return tasks
    .filter((t): t is Task & { dueTs: number } => t.dueTs != null)
    .sort((a, b) => a.dueTs - b.dueTs)
    .slice(0, limit)
}

export type TaskReviewStatus = 'on_track' | 'at_risk' | 'blocked' | 'done'

export const TASK_STATUS_LABELS: Record<TaskReviewStatus, string> = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  blocked: 'Blocked',
  done: 'Done',
}

export interface TaskStatusEntry {
  id: string
  status: TaskReviewStatus
  note?: string
}
