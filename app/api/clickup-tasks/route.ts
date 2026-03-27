import { NextRequest, NextResponse } from 'next/server'
import { buildClickUpSnapshot } from '@/lib/clickup'
import { getCached, setCache } from '@/lib/api-cache'

// GET — read from Supabase cache (no ClickUp API call)
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cached = await getCached('clickup')
  if (!cached) {
    return NextResponse.json({
      error: 'No ClickUp data cached yet. Click ↻ to load.',
      totalTasks: 0, overdue: 0, overduePercent: 0, urgent: 0, completed: 0,
      overdueDetails: [], urgentDetails: [], highDetails: [],
      assigneeStats: {}, tasksByAssignee: {},
    })
  }
  return NextResponse.json({ ...cached.data, cachedAt: cached.fetched_at })
}

// POST — fetch live from ClickUp, store in Supabase
// Called by: refresh button (all logged-in users), daily cron, Generate Now button
export async function POST(req: NextRequest) {
  const role = req.headers.get('x-role')
  const secret = req.headers.get('x-cron-secret')
  const isScheduled = secret === process.env.CRON_SECRET

  if (!isScheduled && !role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.CLICKUP_API_KEY) {
    return NextResponse.json({ error: 'CLICKUP_API_KEY not configured' }, { status: 500 })
  }

  try {
    const snapshot = await buildClickUpSnapshot()
    await setCache('clickup', snapshot)
    return NextResponse.json({ ok: true, ...snapshot })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
