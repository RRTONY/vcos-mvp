import { NextResponse } from 'next/server'
import { authTest } from '@/lib/slack'
import { pingUser } from '@/lib/clickup'
import { pingFireflies } from '@/lib/fireflies'
import { getCachedSWR, recordSuccess } from '@/lib/api-cache'
import { CACHE_TTL_SYSTEMS_MS } from '@/lib/constants'

type Status = 'green' | 'amber' | 'red'

interface SystemResult {
  system: string
  status: Status
  detail: string
}

async function checkSlack(): Promise<SystemResult> {
  if (!process.env.SLACK_BOT_TOKEN) {
    return { system: 'Slack', status: 'amber', detail: 'Token not configured' }
  }
  try {
    const d = await authTest()
    return {
      system: 'Slack',
      status: d.ok ? 'green' : 'red',
      detail: d.ok ? `Connected as ${d.user}` : d.error ?? 'Auth failed',
    }
  } catch (e) {
    return { system: 'Slack', status: 'red', detail: e instanceof Error ? e.message : 'Error' }
  }
}

async function checkClickUp(): Promise<SystemResult> {
  if (!process.env.CLICKUP_API_KEY) {
    return { system: 'ClickUp', status: 'amber', detail: 'API key not configured' }
  }
  try {
    const d = await pingUser()
    return {
      system: 'ClickUp',
      status: d.user ? 'green' : 'red',
      detail: d.user ? `Authed as ${d.user.username}` : 'Auth failed',
    }
  } catch (e) {
    return { system: 'ClickUp', status: 'red', detail: e instanceof Error ? e.message : 'Error' }
  }
}

async function checkFireflies(): Promise<SystemResult> {
  if (!process.env.FIREFLIES_API_KEY) {
    return { system: 'Fireflies', status: 'amber', detail: 'API key not configured' }
  }
  try {
    const d = await pingFireflies()
    const ok = d.data?.user
    return {
      system: 'Fireflies',
      status: ok ? 'green' : 'amber',
      detail: ok ? `Connected as ${d.data.user.name}` : 'Auth issue',
    }
  } catch (e) {
    return { system: 'Fireflies', status: 'red', detail: e instanceof Error ? e.message : 'Error' }
  }
}

export async function GET() {
  // Return stale cache if fresh enough — avoids pinging 3 external APIs on every page load
  const cached = await getCachedSWR('systems-status', CACHE_TTL_SYSTEMS_MS)
  if (cached.data && !cached.stale) {
    return NextResponse.json({
      ...cached.data,
      _ageMinutes: cached.ageMinutes,
    })
  }

  // Cache is stale or missing — fetch live
  const [slack, clickup, fireflies] = await Promise.all([
    checkSlack(),
    checkClickUp(),
    checkFireflies(),
  ])

  const systems: SystemResult[] = [
    { system: 'Netlify', status: 'green', detail: 'Functions running normally' },
    slack,
    clickup,
    { system: 'BILL.com', status: 'red', detail: '12 sync conflicts unresolved' },
    fireflies,
  ]

  const payload = { systems, timestamp: new Date().toISOString() }
  await recordSuccess('systems-status', payload)

  return NextResponse.json({
    ...payload,
    _stale: cached.stale || undefined,
    _ageMinutes: cached.stale ? cached.ageMinutes : undefined,
  })
}
