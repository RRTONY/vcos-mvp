import { NextRequest, NextResponse } from 'next/server'
import { buildFirefliesSnapshot } from '@/lib/fireflies'
import { getCached, setCache } from '@/lib/api-cache'

// GET — read from Supabase cache
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cached = await getCached('fireflies')
  if (!cached) {
    return NextResponse.json({ meetings: [], error: 'No meeting data cached yet. Click ↻ to load.' })
  }
  return NextResponse.json({ ...cached.data, cachedAt: cached.fetched_at })
}

// POST — fetch live from Fireflies, store in cache
export async function POST(req: NextRequest) {
  const role = req.headers.get('x-role')
  const secret = req.headers.get('x-cron-secret')
  const isScheduled = secret === process.env.CRON_SECRET

  if (!isScheduled && !role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.FIREFLIES_API_KEY) return NextResponse.json({ error: 'FIREFLIES_API_KEY not configured' }, { status: 500 })

  try {
    const snapshot = await buildFirefliesSnapshot()
    await setCache('fireflies', snapshot)
    return NextResponse.json({ ok: true, ...snapshot })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
