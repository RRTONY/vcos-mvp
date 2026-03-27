import { NextRequest, NextResponse } from 'next/server'
import { buildWebWorkSnapshot } from '@/lib/webwork'
import { getCachedSWR, recordSuccess, recordFailure, isCircuitOpen } from '@/lib/api-cache'
import { CACHE_TTL_SYSTEMS_MS } from '@/lib/constants'

const EMPTY = { week: [] as string[], members: [] }

// GET — stale-while-revalidate from Supabase cache
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await getCachedSWR('webwork', CACHE_TTL_SYSTEMS_MS)

  if (!result.data) {
    return NextResponse.json({ ...EMPTY, error: result.error, circuitOpen: result.circuitOpen })
  }

  return NextResponse.json({
    ...result.data,
    _stale: result.stale || undefined,
    _ageMinutes: result.stale ? result.ageMinutes : undefined,
    _circuitOpen: result.circuitOpen || undefined,
  })
}

// POST — fetch live from WebWork, store in cache
export async function POST(req: NextRequest) {
  const role = req.headers.get('x-role')
  const secret = req.headers.get('x-cron-secret')
  const isScheduled = secret === process.env.CRON_SECRET

  if (!isScheduled && !role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.WEBWORK_API_KEY) return NextResponse.json({ error: 'WEBWORK_API_KEY not configured' }, { status: 500 })

  if (await isCircuitOpen('webwork')) {
    const stale = await getCachedSWR('webwork', CACHE_TTL_SYSTEMS_MS)
    return NextResponse.json({
      ...(stale.data ?? EMPTY),
      error: 'WebWork circuit open — 3+ consecutive failures. Returning cached data.',
      circuitOpen: true,
      _stale: true,
      _ageMinutes: stale.ageMinutes,
    })
  }

  try {
    const snapshot = await buildWebWorkSnapshot()
    await recordSuccess('webwork', snapshot)
    return NextResponse.json({ ok: true, ...snapshot })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await recordFailure('webwork', msg)
    const stale = await getCachedSWR('webwork', CACHE_TTL_SYSTEMS_MS)
    return NextResponse.json({
      ...(stale.data ?? EMPTY),
      error: `Live fetch failed: ${msg}`,
      _stale: true,
      _ageMinutes: stale.ageMinutes,
    })
  }
}
