// Server-only: one person's open tasks straight from ClickUp, for the weekly
// report. Falls back to the cached snapshot if the live fetch fails, so the
// report never breaks because ClickUp is slow or rate-limited.
import { getLiveTasksForAssignee } from "./clickup";
import { getCachedSWR } from "./api-cache";
import { getTeamMembers } from "./team-db";
import { openTasksFor } from "./open-tasks";
import { CACHE_TTL_SYSTEMS_MS } from "./constants";
import type { ClickUpData, Task } from "./types";

export async function liveOpenTasksFor(
  fullName: string,
): Promise<{ tasks: Task[]; live: boolean }> {
  const member = (await getTeamMembers()).find((m) => m.full_name === fullName);
  const key = member?.clickup_key || fullName.split(" ")[0];
  try {
    const tasks = await getLiveTasksForAssignee(key, member?.clickup_user_id);
    if (tasks) return { tasks, live: true };
  } catch (err) {
    console.error(`Live ClickUp fetch failed for ${fullName}:`, err);
  }
  const cached = await getCachedSWR<ClickUpData>(
    "clickup",
    CACHE_TTL_SYSTEMS_MS,
  );
  return {
    tasks: openTasksFor(
      cached.data?.tasksByAssignee,
      member?.clickup_key,
      fullName.split(" ")[0],
    ),
    live: false,
  };
}
