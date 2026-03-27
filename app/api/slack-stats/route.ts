import { NextRequest, NextResponse } from 'next/server'
import { buildSlackSnapshot, FULL_TEAM, weekLabel } from '@/lib/slack'
import { getCached, setCache } from '@/lib/api-cache'

// GET — read from Supabase cache
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cached = await getCached('slack')
  if (!cached) {
    return NextResponse.json({
      weeklyReports: { filed: [], missing: FULL_TEAM, week: weekLabel() },
      slackStats: { totalMessages: 0, activeMembers: 0, channels: 0 },
      error: 'No Slack data cached yet. Click ↻ to load.',
    })
  }
  return NextResponse.json({ ...cached.data, cachedAt: cached.fetched_at })
}

// POST — fetch live from Slack, store in cache
export async function POST(req: NextRequest) {
  const role = req.headers.get('x-role')
  const secret = req.headers.get('x-cron-secret')
  const isScheduled = secret === process.env.CRON_SECRET

  if (!isScheduled && !role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.SLACK_BOT_TOKEN) return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 500 })

  try {
    const snapshot = await buildSlackSnapshot()
    await setCache('slack', snapshot)
    return NextResponse.json({ ok: true, ...snapshot })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
