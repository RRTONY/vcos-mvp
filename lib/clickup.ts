import {
  CLICKUP_WORKSPACE_ID,
  PRIORITY_URGENT,
  PRIORITY_HIGH,
  CLICKUP_EXCLUDED_FOLDER_IDS,
  CLICKUP_EXCLUDED_LIST_IDS,
} from "@/lib/constants";

const BASE = "https://api.clickup.com/api/v2";

interface CUTask {
  id: string;
  name: string;
  due_date?: string;
  url?: string;
  status?: { status?: string; type?: string; color?: string };
  priority?: { id?: string; priority?: string };
  list?: { id: string; name: string };
  folder?: { id?: string; name?: string };
  assignees?: Array<{
    username?: string;
    email?: string;
    id?: string;
    profilePicture?: string | null;
    initials?: string;
    color?: string;
  }>;
  parent?: string | null;
}

function isExcluded(t: CUTask): boolean {
  return (
    (!!t.folder?.id && CLICKUP_EXCLUDED_FOLDER_IDS.includes(t.folder.id)) ||
    (!!t.list?.id && CLICKUP_EXCLUDED_LIST_IDS.includes(t.list.id))
  );
}

function taskDetail(t: CUTask) {
  return {
    id: t.id,
    name: t.name,
    list: t.list?.name ?? t.folder?.name ?? "Unknown list",
    listId: t.list?.id ?? "",
    status: t.status?.status ?? "",
    statusColor: t.status?.color ?? "",
    dueDate: t.due_date
      ? new Date(parseInt(t.due_date)).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "",
    dueTs: t.due_date ? parseInt(t.due_date) : null,
    priority: t.priority?.priority ?? "",
    url: t.url ?? `https://app.clickup.com/t/${t.id}`,
    assignees: (t.assignees ?? [])
      .map((a) => a.username ?? a.email ?? "")
      .filter(Boolean),
    isSubtask: !!t.parent,
  };
}

export async function buildClickUpSnapshot() {
  const teamId = process.env.CLICKUP_WORKSPACE_ID ?? CLICKUP_WORKSPACE_ID;
  const data = await getTeamTasks(teamId);
  const tasks: CUTask[] = data.tasks ?? [];
  const now = Date.now();

  const overdueTasks = tasks.filter(
    (t) =>
      t.due_date && parseInt(t.due_date) < now && t.status?.type !== "closed",
  );
  const urgentTasks = tasks.filter(
    (t) => t.priority?.id === PRIORITY_URGENT && t.status?.type !== "closed",
  );
  const highTasks = tasks.filter(
    (t) => t.priority?.id === PRIORITY_HIGH && t.status?.type !== "closed",
  );
  const completedTasks = tasks.filter((t) => t.status?.type === "closed");
  const totalActive = tasks.length;

  const assigneeStats: Record<
    string,
    { total: number; overdue: number; urgent: number }
  > = {};
  for (const t of tasks) {
    if (t.status?.type === "closed") continue;
    for (const a of t.assignees ?? []) {
      const name = (a.username ?? a.email ?? "").toLowerCase();
      if (!name) continue;
      if (!assigneeStats[name])
        assigneeStats[name] = { total: 0, overdue: 0, urgent: 0 };
      assigneeStats[name].total++;
      if (t.due_date && parseInt(t.due_date) < now)
        assigneeStats[name].overdue++;
      if (t.priority?.id === PRIORITY_URGENT) assigneeStats[name].urgent++;
    }
  }

  const tasksByAssignee: Record<string, ReturnType<typeof taskDetail>[]> = {};
  for (const t of tasks) {
    if (t.status?.type === "closed") continue;
    for (const a of t.assignees ?? []) {
      const name = (a.username ?? a.email ?? "").toLowerCase();
      if (!name) continue;
      if (!tasksByAssignee[name]) tasksByAssignee[name] = [];
      tasksByAssignee[name].push(taskDetail(t));
    }
  }
  for (const name of Object.keys(tasksByAssignee)) {
    tasksByAssignee[name].sort((a, b) => {
      const ap = a.priority === "urgent" ? 0 : a.priority === "high" ? 1 : 2;
      const bp = b.priority === "urgent" ? 0 : b.priority === "high" ? 1 : 2;
      if (ap !== bp) return ap - bp;
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return 0;
    });
  }

  // Avatar info per assignee (ClickUp profile pictures / initials) - keyed the
  // same way as assigneeStats so the UI can look it up by assignee key.
  const assigneeAvatars: Record<
    string,
    { image: string | null; initials: string | null; color: string | null }
  > = {};
  for (const t of tasks) {
    for (const a of t.assignees ?? []) {
      const name = (a.username ?? a.email ?? "").toLowerCase();
      if (!name || assigneeAvatars[name]) continue;
      assigneeAvatars[name] = {
        image: a.profilePicture ?? null,
        initials: a.initials ?? null,
        color: a.color ?? null,
      };
    }
  }

  return {
    totalTasks: totalActive,
    overdue: overdueTasks.length,
    overduePercent:
      totalActive > 0
        ? Math.round((overdueTasks.length / totalActive) * 100)
        : 0,
    urgent: urgentTasks.length,
    completed: completedTasks.length,
    overdueDetails: overdueTasks.slice(0, 25).map(taskDetail),
    urgentDetails: urgentTasks.slice(0, 25).map(taskDetail),
    highDetails: highTasks.slice(0, 25).map(taskDetail),
    assigneeStats,
    tasksByAssignee,
    assigneeAvatars,
  };
}

function headers() {
  return {
    Authorization: process.env.CLICKUP_API_KEY ?? "",
    "Content-Type": "application/json",
  };
}

// Firing a batch of concurrent ClickUp requests (see getTeamTasks below)
// occasionally trips ClickUp's per-minute rate limit on one request in the
// batch. Retry a 429 with backoff (honoring Retry-After when present) instead
// of failing the whole snapshot over one rate-limited page.
async function fetchClickUp(
  url: string,
  init: RequestInit = {},
  retries = 3,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...headers(),
        ...(init.headers as Record<string, string> | undefined),
      },
      next: { revalidate: 0 },
    });
    if (res.status !== 429 || attempt >= retries) return res;
    const retryAfterSec = Number(res.headers.get("Retry-After"));
    const waitMs =
      Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : 500 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

export async function getTeamTasks(teamId: string) {
  // Filter to tasks updated in the last 180 days to exclude stale archived work
  const since = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const base = `${BASE}/team/${teamId}/task?subtasks=true&include_closed=false&date_updated_gt=${since}`;

  // Fetch pages in concurrent batches instead of one-at-a-time. Sequential
  // pagination of ~20+ pages took ~25s and timed out serverless functions
  // (causing the dashboard to intermittently lose all ClickUp data). Batches of
  // BATCH keep us well under ClickUp's rate limit while cutting wall-clock ~4-5x.
  const BATCH = 12;
  const MAX_PAGES = 60; // safety cap: 6000 tasks

  async function fetchPage(
    page: number,
  ): Promise<{ tasks: CUTask[]; last: boolean }> {
    const res = await fetchClickUp(`${base}&page=${page}`);
    if (!res.ok) throw new Error(`ClickUp tasks ${res.status}`);
    const data = await res.json();
    const tasks: CUTask[] = data.tasks ?? [];
    return { tasks, last: data.last_page === true || tasks.length === 0 };
  }

  const allTasks: CUTask[] = [];
  let done = false;
  for (let start = 0; !done && start < MAX_PAGES; start += BATCH) {
    const pages = Array.from({ length: BATCH }, (_, i) => start + i);
    const results = await Promise.all(pages.map(fetchPage));
    for (const r of results) {
      allTasks.push(...r.tasks);
      if (r.last) done = true;
    }
  }

  // Drop tasks from excluded legacy/archive folders+lists before they ever
  // reach a consumer - keeps them out of stats, overdue counts, and AI context.
  return { tasks: allTasks.filter((t) => !isExcluded(t)) };
}

export async function pingUser() {
  const res = await fetchClickUp(`${BASE}/user`);
  if (!res.ok) throw new Error(`ClickUp ping ${res.status}`);
  return res.json();
}

export async function createTask(
  listId: string,
  data: Record<string, unknown>,
) {
  const res = await fetchClickUp(`${BASE}/list/${listId}/task`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`ClickUp createTask ${res.status}`);
  return res.json();
}

// Statuses are custom per-list in ClickUp, so the valid options for a task
// depend on which list it lives in.
export async function getListStatuses(listId: string) {
  const res = await fetchClickUp(`${BASE}/list/${listId}`);
  if (!res.ok) throw new Error(`ClickUp list ${res.status}`);
  const data = await res.json();
  const statuses: Array<{ status: string; color?: string; type?: string }> =
    data.statuses ?? [];
  return statuses.map((s) => ({
    status: s.status,
    color: s.color ?? "",
    type: s.type ?? "",
  }));
}

export async function updateTaskStatus(taskId: string, status: string) {
  const res = await fetchClickUp(`${BASE}/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`ClickUp updateTask ${res.status}`);
  return res.json();
}
