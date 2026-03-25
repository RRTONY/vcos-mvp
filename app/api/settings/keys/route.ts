import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const ENV_KEYS = [
  'SLACK_BOT_TOKEN',
  'CLICKUP_API_KEY',
  'FIREFLIES_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'WEBWORK_API_KEY',
  'WEBWORK_COMPANY_ID',
  'AUTH_SECRET',
]

export async function GET(req: NextRequest) {
  if (req.headers.get('x-role') !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await supabase.from('vcos_api_keys').select('*')
  const dbKeys: Record<string, { masked_value: string; last_updated: string; updated_by: string }> =
    Object.fromEntries((data ?? []).map((k) => [k.key_name, k]))

  const keys = ENV_KEYS.map((name) => {
    const val = process.env[name]
    const set = !!val
    const masked = val ? val.slice(0, 6) + '••••••••' + val.slice(-4) : '—'
    return {
      key_name: name,
      set,
      masked_value: dbKeys[name]?.masked_value ?? masked,
      last_updated: dbKeys[name]?.last_updated ?? null,
      updated_by: dbKeys[name]?.updated_by ?? null,
    }
  })

  return NextResponse.json(keys)
}

export async function PATCH(req: NextRequest) {
  if (req.headers.get('x-role') !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = req.headers.get('x-user') ?? 'admin'
  const { key_name, masked_value } = await req.json()

  await supabase.from('vcos_api_keys').upsert({
    key_name,
    masked_value,
    last_updated: new Date().toISOString(),
    updated_by: admin,
  })

  return NextResponse.json({ ok: true })
}
