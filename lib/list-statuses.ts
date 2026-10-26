// Client-side per-list ClickUp status options, fetched once per list and
// shared across every component (ClickUp statuses are custom per-list, not
// global - e.g. "complete" vs "completed", or a sales pipeline on CLIENTS).
import type { ClickUpStatus } from "./types";

const listStatusCache = new Map<string, Promise<ClickUpStatus[]>>();

export function fetchListStatuses(listId: string): Promise<ClickUpStatus[]> {
  let promise = listStatusCache.get(listId);
  if (!promise) {
    promise = fetch(`/api/clickup-tasks/statuses?listId=${listId}`)
      .then((r) => r.json())
      .then((d) => (d.statuses ?? []) as ClickUpStatus[])
      .catch(() => {
        // Don't cache a failure - let the next caller retry.
        listStatusCache.delete(listId);
        return [];
      });
    listStatusCache.set(listId, promise);
  }
  return promise;
}
