import { NextRequest, NextResponse } from 'next/server'
import { buildClickUpSnapshot } from '@/lib/clickup'
import { getCachedSWR, recordSuccess, recordFailure, isCircuitOpen } from '@/lib/api-cache'
import { CACHE_TTL_SYSTEMS_MS } from '@/lib/constants'

const EMPTY = {
  totalTasks: 0, overdue: 0, overduePercent: 0, urgent: 0, completed: 0,
  overdueDetails: [], urgentDetails: [], highDetails: [],
  assigneeStats: {}, tasksByAssignee: {},
}

// GET — stale-while-revalidate from Supabase cache (no ClickUp API call)
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await getCachedSWR('clickup', CACHE_TTL_SYSTEMS_MS)

  if (!result.data) {
    return NextResponse.json({
      ...EMPTY,
      error: result.error,
      circuitOpen: result.circuitOpen,
    })
  }

  return NextResponse.json({
    ...result.data,
    _stale: result.stale || undefined,
    _ageMinutes: result.stale ? result.ageMinutes : undefined,
    _circuitOpen: result.circuitOpen || undefined,
  })
}

// POST — fetch live from ClickUp, store in Supabase
export async function POST(req: NextRequest) {
  const role = req.headers.get('x-role')
  const secret = req.headers.get('x-cron-secret')
  const isScheduled = secret === process.env.CRON_SECRET

  if (!isScheduled && !role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.CLICKUP_API_KEY) return NextResponse.json({ error: 'CLICKUP_API_KEY not configured' }, { status: 500 })

  if (await isCircuitOpen('clickup')) {
    // Still return stale data so the UI isn't blank
    const stale = await getCachedSWR('clickup', CACHE_TTL_SYSTEMS_MS)
    return NextResponse.json({
      ...(stale.data ?? EMPTY),
      error: 'ClickUp circuit open — 3+ consecutive failures. Returning cached data.',
      circuitOpen: true,
      _stale: true,
      _ageMinutes: stale.ageMinutes,
    })
  }

  try {
    const snapshot = await buildClickUpSnapshot()
    await recordSuccess('clickup', snapshot)
    return NextResponse.json({ ok: true, ...snapshot })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await recordFailure('clickup', msg)
    // Return stale cache rather than an error so the dashboard stays populated
    const stale = await getCachedSWR('clickup', CACHE_TTL_SYSTEMS_MS)
    return NextResponse.json({
      ...(stale.data ?? EMPTY),
      error: `Live fetch failed: ${msg}`,
      _stale: true,
      _ageMinutes: stale.ageMinutes,
    })
  }
}
