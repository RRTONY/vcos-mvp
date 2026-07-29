import { NextRequest, NextResponse } from 'next/server'
import { getListStatuses } from '@/lib/clickup'

// GET /api/clickup-tasks/statuses?listId=... — the set of custom statuses
// valid for a given ClickUp list (statuses are per-list, not global).
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.CLICKUP_API_KEY) return NextResponse.json({ error: 'CLICKUP_API_KEY not configured' }, { status: 500 })

  const listId = req.nextUrl.searchParams.get('listId')
  if (!listId) return NextResponse.json({ error: 'listId required' }, { status: 400 })

  try {
    const statuses = await getListStatuses(listId)
    return NextResponse.json({ statuses })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
