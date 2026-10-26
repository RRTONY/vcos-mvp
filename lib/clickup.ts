import { getCached, recordSuccess } from "@/lib/api-cache";
import type { ClickUpTaskDetail } from "@/lib/types";
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

// Cache source holding the raw open-task list the snapshot is computed from,
// so a single task change (webhook, or a status edit made in VCoS) can be
// patched in and the snapshot recomputed without re-fetching every page.
const RAW_SOURCE = "clickup-raw";

// Only the fields the snapshot reads - keeps the stored raw list small.
function slimTask(t: CUTask): CUTask {
  return {
    id: t.id,
    name: t.name,
    due_date: t.due_date ?? undefined,
    url: t.url,
    status: t.status,
    priority: t.priority ?? undefined,
    list: t.list,
    folder: t.folder,
    assignees: (t.assignees ?? []).map((a) => ({
      username: a.username,
      email: a.email,
      id: a.id,
      profilePicture: a.profilePicture ?? null,
      initials: a.initials,
      color: a.color,
    })),
    parent: t.parent ?? null,
  };
}

// Full live fetch. Also stores the raw task list so later single-task
// updates (applyTaskChange) can patch it instead of re-fetching everything.
export async function buildClickUpSnapshot() {
  const teamId = process.env.CLICKUP_WORKSPACE_ID ?? CLICKUP_WORKSPACE_ID;
  const data = await getTeamTasks(teamId);
  const tasks = (data.tasks ?? []).map(slimTask);
  await recordSuccess(RAW_SOURCE, tasks);
  return snapshotFromTasks(tasks);
}

// Keeps VCoS in step with ClickUp in real time: replaces (or removes) one
// task in the stored raw list and rewrites the snapshot every page reads.
// `task` is the task as ClickUp now has it, or null if it was deleted.
// Closed and excluded tasks are dropped, matching the full fetch (which uses
// include_closed=false). Falls back to a full rebuild if no raw list exists.
// Patches within one server instance run one at a time (e.g. a weekly report
// updating several tasks at once) so they can't overwrite each other's
// read-modify-write; the periodic full refresh corrects any cross-instance
// race.
let patchQueue: Promise<unknown> = Promise.resolve();
export function applyTaskChange(taskId: string, task: CUTask | null) {
  const run = patchQueue.then(() => patchTask(taskId, task));
  patchQueue = run.catch(() => {});
  return run;
}

async function patchTask(taskId: string, task: CUTask | null) {
  const raw = await getCached(RAW_SOURCE);
  if (!Array.isArray(raw?.data)) {
    await recordSuccess("clickup", await buildClickUpSnapshot());
    return;
  }
  const tasks = (raw.data as CUTask[]).filter((t) => t.id !== taskId);
  if (task && task.status?.type !== "closed" && !isExcluded(task))
    tasks.push(slimTask(task));
  await recordSuccess(RAW_SOURCE, tasks);
  await recordSuccess("clickup", snapshotFromTasks(tasks));
}

// Single task as ClickUp has it now; null if it no longer exists.
export async function getTask(taskId: string): Promise<CUTask | null> {
  const res = await fetchClickUp(`${BASE}/task/${taskId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ClickUp getTask ${res.status}`);
  return res.json();
}

type TaskDetail = ReturnType<typeof taskDetail>;

function byPriorityThenDue(a: TaskDetail, b: TaskDetail) {
  const ap = a.priority === "urgent" ? 0 : a.priority === "high" ? 1 : 2;
  const bp = b.priority === "urgent" ? 0 : b.priority === "high" ? 1 : 2;
  if (ap !== bp) return ap - bp;
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  return 0;
}

// One person's open tasks fetched live from ClickUp (not the cached
// snapshot) - used by the weekly report so the reporter always reviews what
// ClickUp has right now. The person is matched the same way the snapshot is
// keyed: their ClickUp key is a substring of the lowercased username/email.
// A known ClickUp user id skips the lookup. Returns null if no ClickUp user
// matches.
export async function getLiveTasksForAssignee(
  cuKey: string,
  clickupUserId?: string | null,
): Promise<TaskDetail[] | null> {
  const teamId = process.env.CLICKUP_WORKSPACE_ID ?? CLICKUP_WORKSPACE_ID;
  let userId = clickupUserId?.trim() || null;
  if (!userId) {
    const key = cuKey.trim().toLowerCase();
    if (!key) return null;
    const teamsRes = await fetchClickUp(`${BASE}/team`);
    if (!teamsRes.ok) throw new Error(`ClickUp team ${teamsRes.status}`);
    const teams: Array<{
      id: string;
      members?: Array<{
        user: { id: number; username?: string; email?: string };
      }>;
    }> = (await teamsRes.json()).teams ?? [];
    const user = teams
      .find((t) => t.id === teamId)
      ?.members?.map((m) => m.user)
      .find((u) =>
        [u.username, u.email].some((n) => n?.toLowerCase().includes(key)),
      );
    if (!user) return null;
    userId = String(user.id);
  }

  // Same 180-day staleness cutoff as the full snapshot (getTeamTasks).
  const since = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const tasks: CUTask[] = [];
  for (let page = 0; page < 20; page++) {
    const res = await fetchClickUp(
      `${BASE}/team/${teamId}/task?subtasks=true&include_closed=false&date_updated_gt=${since}&assignees[]=${userId}&page=${page}`,
    );
    if (!res.ok) throw new Error(`ClickUp tasks ${res.status}`);
    const data = await res.json();
    tasks.push(...(data.tasks ?? []));
    if (data.last_page === true || (data.tasks ?? []).length === 0) break;
  }
  return tasks
    .filter((t) => !isExcluded(t) && t.status?.type !== "closed")
    .map(taskDetail)
    .sort(byPriorityThenDue);
}

const fmtDate = (ms?: string | null) =>
  ms
    ? new Date(parseInt(ms)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Los_Angeles",
      })
    : null;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i;
// Markdown image syntax ClickUp uses for images pasted into a description.
const MD_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;

// Everything the task detail modal shows: description, images and files,
// assignees, dates, recent comments, and the list's statuses so the status
// can be changed right there.
export async function getTaskDetail(
  taskId: string,
): Promise<ClickUpTaskDetail> {
  const [taskRes, commentsRes] = await Promise.all([
    fetchClickUp(`${BASE}/task/${taskId}?include_markdown_description=true`),
    fetchClickUp(`${BASE}/task/${taskId}/comment`),
  ]);
  if (!taskRes.ok) throw new Error(`ClickUp getTask ${taskRes.status}`);
  const t = await taskRes.json();
  const comments: Array<{
    comment_text?: string;
    user?: { username?: string; email?: string };
    date?: string;
  }> = commentsRes.ok ? ((await commentsRes.json()).comments ?? []) : [];
  const statuses = t.list?.id ? await getListStatuses(t.list.id) : [];

  const markdown: string = t.markdown_description || t.text_content || "";
  const images: ClickUpTaskDetail["images"] = [];
  for (const m of markdown.matchAll(MD_IMAGE))
    images.push({ url: m[2], title: m[1] || "Image" });
  const files: ClickUpTaskDetail["files"] = [];
  for (const a of (t.attachments ?? []) as Array<{
    url: string;
    title?: string;
    mimetype?: string;
  }>) {
    const item = { url: a.url, title: a.title ?? "Attachment" };
    if (a.mimetype?.startsWith("image/") || IMAGE_EXT.test(a.url)) {
      if (!images.some((i) => i.url === a.url)) images.push(item);
    } else files.push(item);
  }

  return {
    id: t.id,
    name: t.name,
    url: t.url ?? `https://app.clickup.com/t/${t.id}`,
    description: markdown.replace(MD_IMAGE, "").trim(),
    status: t.status?.status ?? "",
    statusColor: t.status?.color ?? "",
    listId: t.list?.id ?? "",
    list: t.list?.name ?? "",
    statuses,
    priority: t.priority?.priority ?? "",
    dueDate: fmtDate(t.due_date),
    startDate: fmtDate(t.start_date),
    createdAt: fmtDate(t.date_created),
    creator: t.creator?.username ?? t.creator?.email ?? null,
    assignees: (t.assignees ?? []).map(
      (a: {
        username?: string;
        email?: string;
        profilePicture?: string | null;
        initials?: string;
      }) => ({
        name: a.username ?? a.email ?? "",
        image: a.profilePicture ?? null,
        initials: a.initials ?? "",
      }),
    ),
    tags: (t.tags ?? []).map((g: { name: string }) => g.name),
    images,
    files,
    comments: comments.slice(0, 10).map((c) => ({
      author: c.user?.username ?? c.user?.email ?? "Someone",
      text: c.comment_text ?? "",
      date: fmtDate(c.date),
    })),
  };
}

function snapshotFromTasks(tasks: CUTask[]) {
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

  const tasksByAssignee: Record<string, TaskDetail[]> = {};
  for (const t of tasks) {
    if (t.status?.type === "closed") continue;
    for (const a of t.assignees ?? []) {
      const name = (a.username ?? a.email ?? "").toLowerCase();
      if (!name) continue;
      if (!tasksByAssignee[name]) tasksByAssignee[name] = [];
      tasksByAssignee[name].push(taskDetail(t));
    }
  }
  for (const name of Object.keys(tasksByAssignee))
    tasksByAssignee[name].sort(byPriorityThenDue);

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

// Updates the status in ClickUp and immediately patches VCoS's cached copy
// with the task ClickUp returns, so every VCoS page sees the change without
// waiting for the webhook or the next full refresh.
export async function updateTaskStatus(taskId: string, status: string) {
  const res = await fetchClickUp(`${BASE}/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`ClickUp updateTask ${res.status}`);
  const task: CUTask = await res.json();
  await applyTaskChange(taskId, task).catch((err) =>
    console.error(`VCoS cache patch failed for task ${taskId}:`, err),
  );
  return task;
}

// Sets a task to one of its own list's statuses, matched case-insensitively
// and written back with the list's exact spelling - ClickUp statuses are
// custom per-list (e.g. "complete" vs "completed"), so a name valid on one
// list may not exist on another. Pass `listStatuses` to reuse an
// already-fetched list config.
export async function setTaskStatusOnList(
  taskId: string,
  listId: string,
  status: string,
  listStatuses?: Awaited<ReturnType<typeof getListStatuses>>,
) {
  const statuses = listStatuses ?? (await getListStatuses(listId));
  const match = statuses.find(
    (s) => s.status.toLowerCase() === status.trim().toLowerCase(),
  );
  if (!match)
    throw new Error(`Status "${status}" doesn't exist on list ${listId}`);
  return updateTaskStatus(taskId, match.status);
}
