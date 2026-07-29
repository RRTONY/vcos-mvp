import { NextRequest, NextResponse } from 'next/server'
import { buildWebWorkSnapshot } from '@/lib/webwork'
import { getCachedSWR, recordSuccess, recordFailure, isCircuitOpen } from '@/lib/api-cache'
import { CACHE_TTL_SYSTEMS_MS } from '@/lib/constants'

const EMPTY = { week: [] as string[], members: [], projects: [] }

// GET — stale-while-revalidate from Supabase cache for the current week.
// ?week_start=YYYY-MM-DD (a Monday) fetches that week live instead — only the
// current week is cached, so picking a past/other week always hits WebWork directly.
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const weekStartParam = req.nextUrl.searchParams.get('week_start')
  if (weekStartParam) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStartParam)
    if (!m) return NextResponse.json({ error: 'week_start must be YYYY-MM-DD' }, { status: 400 })
    if (!process.env.WEBWORK_API_KEY) return NextResponse.json({ error: 'WEBWORK_API_KEY not configured' }, { status: 500 })

    const monday = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
    try {
      const snapshot = await buildWebWorkSnapshot(monday)
      return NextResponse.json({ ok: true, ...snapshot })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ ...EMPTY, error: `Live fetch failed: ${msg}` })
    }
  }

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
    if (snapshot.incomplete) {
      // Don't let a partial/failed fetch overwrite the last known-good cache
      // with an all-zero-looking snapshot — that's what made "hours not
      // coming through" look like a data bug instead of a transient one.
      // Count it as a failure (so 3 in a row opens the circuit breaker and
      // stops hammering WebWork) but hand the live partial result back to
      // whoever explicitly asked for this refresh (e.g. the Retry button).
      await recordFailure('webwork', 'Partial fetch — some members\' hours could not be retrieved from WebWork')
      return NextResponse.json({ ok: true, ...snapshot })
    }
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
