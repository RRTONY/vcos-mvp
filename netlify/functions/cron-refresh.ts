/**
 * Daily cache refresh — runs at 8 AM PT (15:00 UTC, covers PDT).
 * Fetches live data from all 4 external APIs and stores in Supabase cache
 * so the dashboard is populated before anyone opens it each morning.
 *
 * Schedule: 8 AM PT daily (Mon–Sun)
 * Trigger:  Netlify Scheduled Functions
 */
import type { Config } from '@netlify/functions'

const SOURCES = [
  'clickup-tasks',
  'slack-stats',
  'webwork',
  'fireflies-meetings',
] as const

export default async () => {
  const base = process.env.NEXT_PUBLIC_URL ?? process.env.URL
  const secret = process.env.CRON_SECRET

  if (!base || !secret) {
    console.error('[cron-refresh] Missing NEXT_PUBLIC_URL or CRON_SECRET env vars')
    return new Response('Missing env vars', { status: 500 })
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-cron-secret': secret,
  }

  const results = await Promise.allSettled(
    SOURCES.map(src => fetch(`${base}/api/${src}`, { method: 'POST', headers }))
  )

  const log = results.map((r, i) => {
    const name = SOURCES[i]
    if (r.status === 'fulfilled') return `${name}: ${r.value.status}`
    return `${name}: ERROR — ${r.reason}`
  })

  console.log('[cron-refresh]', new Date().toISOString(), log.join(' | '))
  return new Response(JSON.stringify({ ok: true, log }), { status: 200 })
}

export const config: Config = {
  // 15:00 UTC = 8:00 AM PDT (UTC-7). Adjust to 16:00 UTC in winter if needed.
  schedule: '0 15 * * *',
}
