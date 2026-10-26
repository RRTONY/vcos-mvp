// Shared "this person's open ClickUp tasks" lookup - used by Open Loops and
// the weekly report's "Your Open Tasks" section. Always scoped to a single
// assignee; never returns another team member's tasks.
import type { Task } from "./types";

/** Find the tasksByAssignee key that matches a ClickUp key (usernames are
 *  stored lowercased and may include extra suffixes, so we match by substring
 *  the same way Open Loops does). */
export function findAssigneeKey(
  map: Record<string, unknown> | undefined,
  cuKey: string,
): string | null {
  if (!map || !cuKey) return null;
  return Object.keys(map).find((k) => k.includes(cuKey)) ?? null;
}

/** This person's open tasks only - looked up by their ClickUp key (falling
 *  back to their first name if no key is configured). */
export function openTasksFor(
  tasksByAssignee: Record<string, Task[]> | undefined,
  clickupKey: string | null | undefined,
  fallbackFirstName: string,
): Task[] {
  const cuKey = (clickupKey || fallbackFirstName || "").toLowerCase();
  const key = findAssigneeKey(tasksByAssignee, cuKey);
  return key ? tasksByAssignee![key] : [];
}

/** Only tasks with a real due date, soonest/most-overdue first - tasks with
 *  no due date carry no accountability date, so the weekly report's "Your
 *  Open Tasks" section drops them entirely. No cap - every due-dated task
 *  is included.
 *
 *  CRM-list task names are the client (e.g. "Lia Dispute with Simone
 *  Giacomelli"), not the action - the real work lives on its subtasks, so a
 *  CRM parent task's own due date isn't meaningful accountability. Only CRM
 *  subtasks are kept; every other list is unaffected. */
export function dueDateTasksOnly(tasks: Task[]): Task[] {
  return tasks
    .filter((t): t is Task & { dueTs: number } => t.dueTs != null)
    .filter((t) => t.list.toLowerCase() !== "crm" || t.isSubtask)
    .sort((a, b) => a.dueTs - b.dueTs);
}

/** A weekly-report answer for one task. `status` is the task's real ClickUp
 *  status name (from its own list's statuses), so whatever the reporter picks
 *  is exactly what gets written back to ClickUp - no VCoS-only labels. */
export interface TaskStatusEntry {
  id: string;
  status: string;
  note?: string;
}
