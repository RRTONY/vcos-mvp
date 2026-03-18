import { NextResponse } from 'next/server'
import { getTeamTasks } from '@/lib/clickup'

interface CUTask {
  id: string
  name: string
  due_date?: string
  url?: string
  status?: { status?: string; type?: string }
  priority?: { id?: string; priority?: string }
  list?: { id: string; name: string }
  folder?: { name: string }
  assignees?: Array<{ username?: string; email?: string }>
}

export async function GET() {
  const apiKey = process.env.CLICKUP_API_KEY
  const teamId = process.env.CLICKUP_WORKSPACE_ID ?? '10643959'

  if (!apiKey) {
    return NextResponse.json({ error: 'CLICKUP_API_KEY not configured' }, { status: 500 })
  }

  try {
    const data = await getTeamTasks(teamId)
    const tasks: CUTask[] = data.tasks ?? []

    const now = Date.now()
    const overdueTasks = tasks.filter(
      (t) => t.due_date && parseInt(t.due_date) < now && t.status?.type !== 'closed'
    )
    const urgentTasks = tasks.filter((t) => t.priority?.id === '1')
    const completedTasks = tasks.filter((t) => t.status?.type === 'closed')
    const totalActive = tasks.length

    // Return top 25 overdue tasks with names for drill-down
    const overdueDetails = overdueTasks.slice(0, 25).map((t) => ({
      id: t.id,
      name: t.name,
      list: t.list?.name ?? t.folder?.name ?? 'Unknown list',
      dueDate: t.due_date ? new Date(parseInt(t.due_date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
      priority: t.priority?.priority ?? '',
      url: t.url ?? `https://app.clickup.com/t/${t.id}`,
      assignees: (t.assignees ?? []).map((a) => a.username ?? a.email ?? '').filter(Boolean),
    }))

    return NextResponse.json({
      totalTasks: totalActive,
      overdue: overdueTasks.length,
      overduePercent: totalActive > 0 ? Math.round((overdueTasks.length / totalActive) * 100) : 0,
      urgent: urgentTasks.length,
      completed: completedTasks.length,
      overdueDetails,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
