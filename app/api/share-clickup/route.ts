import { NextRequest, NextResponse } from 'next/server'
import { createTask } from '@/lib/clickup'

const DEFAULT_LIST = '901102575315'

export async function POST(req: NextRequest) {
  if (!process.env.CLICKUP_API_KEY) {
    return NextResponse.json({ error: 'CLICKUP_API_KEY not configured' }, { status: 500 })
  }
  const { title, description, priority, listId } = await req.json()
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  try {
    const task = await createTask(listId ?? DEFAULT_LIST, {
      name: title,
      description: description ?? '',
      priority: priority ?? 3, // 1=urgent 2=high 3=normal 4=low
    })
    return NextResponse.json({ success: true, taskId: task.id, url: `https://app.clickup.com/t/${task.id}` })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
