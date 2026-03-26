import { NextRequest, NextResponse } from 'next/server'

const ENV_KEYS = [
  'SLACK_BOT_TOKEN',
  'CLICKUP_API_KEY',
  'FIREFLIES_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'WEBWORK_API_KEY',
  'WEBWORK_COMPANY_ID',
  'AUTH_SECRET',
  'CRON_SECRET',
]

export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role') ?? ''
  if (!['admin', 'owner'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const keys = ENV_KEYS.map((name) => {
    const val = process.env[name]
    const set = !!val
    const masked = val ? val.slice(0, 6) + '••••••••' + val.slice(-4) : '—'
    return { key_name: name, set, masked_value: masked }
  })

  return NextResponse.json(keys)
}
