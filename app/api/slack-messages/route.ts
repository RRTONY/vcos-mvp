// Slack channel message ingestion (Phase 3).
// GET  — stale-while-revalidate from the Supabase cache (no Slack call).
// POST — fetch live from Slack and store (admin or scheduled cron).
import { NextRequest, NextResponse } from 'next/server'
import { buildSlackMessagesSnapshot } from '@/lib/slack'
import { getCachedSWR, recordSuccess, recordFailure, isCircuitOpen } from '@/lib/api-cache'
import { CACHE_TTL_SYSTEMS_MS } from '@/lib/constants'

const EMPTY = { messages: [], byChannel: {}, channelCount: 0 }

export async function GET(req: NextRequest) {
  if (!req.headers.get('x-role')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await getCachedSWR('slack-messages', CACHE_TTL_SYSTEMS_MS)
  if (!result.data) return NextResponse.json({ ...EMPTY, error: result.error, circuitOpen: result.circuitOpen })
  return NextResponse.json({
    ...result.data,
    _stale: result.stale || undefined,
    _ageMinutes: result.stale ? result.ageMinutes : undefined,
  })
}

export async function POST(req: NextRequest) {
  const role = req.headers.get('x-role')
  const isScheduled = req.headers.get('x-cron-secret') === process.env.CRON_SECRET
  if (!isScheduled && !role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.SLACK_BOT_TOKEN) return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 500 })

  if (await isCircuitOpen('slack-messages')) {
    const stale = await getCachedSWR('slack-messages', CACHE_TTL_SYSTEMS_MS)
    return NextResponse.json({ ...(stale.data ?? EMPTY), error: 'Slack circuit open — returning cached data.', _stale: true })
  }

  try {
    const snapshot = await buildSlackMessagesSnapshot()
    await recordSuccess('slack-messages', snapshot)
    return NextResponse.json({ ok: true, ...snapshot })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await recordFailure('slack-messages', msg)
    const stale = await getCachedSWR('slack-messages', CACHE_TTL_SYSTEMS_MS)
    return NextResponse.json({ ...(stale.data ?? EMPTY), error: `Live fetch failed: ${msg}`, _stale: true })
  }
}
