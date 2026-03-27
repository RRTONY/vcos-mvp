const BASE = 'https://api.clickup.com/api/v2'

interface CUTask {
  id: string
  name: string
  due_date?: string
  url?: string
  status?: { status?: string; type?: string }
  priority?: { id?: string; priority?: string }
  list?: { id: string; name: string }
  folder?: { name: string }
  assignees?: Array<{ username?: string; email?: string; id?: string }>
}

function taskDetail(t: CUTask) {
  return {
    id: t.id,
    name: t.name,
    list: t.list?.name ?? t.folder?.name ?? 'Unknown list',
    dueDate: t.due_date ? new Date(parseInt(t.due_date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
    priority: t.priority?.priority ?? '',
    url: t.url ?? `https://app.clickup.com/t/${t.id}`,
    assignees: (t.assignees ?? []).map((a) => a.username ?? a.email ?? '').filter(Boolean),
  }
}

export async function buildClickUpSnapshot() {
  const teamId = process.env.CLICKUP_WORKSPACE_ID ?? '10643959'
  const data = await getTeamTasks(teamId)
  const tasks: CUTask[] = data.tasks ?? []
  const now = Date.now()

  const overdueTasks = tasks.filter(t => t.due_date && parseInt(t.due_date) < now && t.status?.type !== 'closed')
  const urgentTasks  = tasks.filter(t => t.priority?.id === '1' && t.status?.type !== 'closed')
  const highTasks    = tasks.filter(t => t.priority?.id === '2' && t.status?.type !== 'closed')
  const completedTasks = tasks.filter(t => t.status?.type === 'closed')
  const totalActive  = tasks.length

  const assigneeStats: Record<string, { total: number; overdue: number; urgent: number }> = {}
  for (const t of tasks) {
    if (t.status?.type === 'closed') continue
    for (const a of (t.assignees ?? [])) {
      const name = (a.username ?? a.email ?? '').toLowerCase()
      if (!name) continue
      if (!assigneeStats[name]) assigneeStats[name] = { total: 0, overdue: 0, urgent: 0 }
      assigneeStats[name].total++
      if (t.due_date && parseInt(t.due_date) < now) assigneeStats[name].overdue++
      if (t.priority?.id === '1') assigneeStats[name].urgent++
    }
  }

  const tasksByAssignee: Record<string, ReturnType<typeof taskDetail>[]> = {}
  for (const t of tasks) {
    if (t.status?.type === 'closed') continue
    for (const a of (t.assignees ?? [])) {
      const name = (a.username ?? a.email ?? '').toLowerCase()
      if (!name) continue
      if (!tasksByAssignee[name]) tasksByAssignee[name] = []
      tasksByAssignee[name].push(taskDetail(t))
    }
  }
  for (const name of Object.keys(tasksByAssignee)) {
    tasksByAssignee[name].sort((a, b) => {
      const ap = a.priority === 'urgent' ? 0 : a.priority === 'high' ? 1 : 2
      const bp = b.priority === 'urgent' ? 0 : b.priority === 'high' ? 1 : 2
      if (ap !== bp) return ap - bp
      if (a.dueDate && !b.dueDate) return -1
      if (!a.dueDate && b.dueDate) return 1
      return 0
    })
  }

  return {
    totalTasks: totalActive,
    overdue: overdueTasks.length,
    overduePercent: totalActive > 0 ? Math.round((overdueTasks.length / totalActive) * 100) : 0,
    urgent: urgentTasks.length,
    completed: completedTasks.length,
    overdueDetails: overdueTasks.slice(0, 25).map(taskDetail),
    urgentDetails:  urgentTasks.slice(0, 25).map(taskDetail),
    highDetails:    highTasks.slice(0, 25).map(taskDetail),
    assigneeStats,
    tasksByAssignee,
  }
}

function headers() {
  return {
    Authorization: process.env.CLICKUP_API_KEY ?? '',
    'Content-Type': 'application/json',
  }
}

export async function getTeamTasks(teamId: string) {
  const res = await fetch(
    `${BASE}/team/${teamId}/task?subtasks=true&include_closed=false`,
    { headers: headers(), next: { revalidate: 0 } }
  )
  if (!res.ok) throw new Error(`ClickUp tasks ${res.status}`)
  return res.json()
}

export async function pingUser() {
  const res = await fetch(`${BASE}/user`, {
    headers: headers(),
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`ClickUp ping ${res.status}`)
  return res.json()
}

export async function createTask(listId: string, data: Record<string, unknown>) {
  const res = await fetch(`${BASE}/list/${listId}/task`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`ClickUp createTask ${res.status}`)
  return res.json()
}
