import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword, generateTempPassword } from '@/lib/password'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (req.headers.get('x-role') !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = req.headers.get('x-user') ?? 'admin'

  const { data: req_row, error: fetchErr } = await supabase
    .from('vcos_signup_requests')
    .select('*')
    .eq('id', params.id)
    .single()

  if (fetchErr || !req_row) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const username = (req_row.username_requested || req_row.name).toLowerCase().replace(/\s+/g, '')
  const role = req_row.role_requested || 'user'
  const tempPassword = generateTempPassword()
  const password_hash = await hashPassword(tempPassword)

  const { error: createErr } = await supabase.from('vcos_users').insert({
    username,
    email: req_row.email,
    role,
    password_hash,
    status: 'active',
    approved_by: admin,
  })

  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })

  await supabase.from('vcos_signup_requests').update({ status: 'approved' }).eq('id', params.id)

  // Post to Slack
  try {
    const slackToken = process.env.SLACK_BOT_TOKEN
    if (slackToken) {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${slackToken}` },
        body: JSON.stringify({
          channel: 'D000000', // will DM admin — replace with real channel/DM ID if needed
          text: `✅ Access approved for *${req_row.name}*\nUsername: \`${username}\`\nTemp password: \`${tempPassword}\`\nRole: ${role}`,
        }),
      })
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, username, tempPassword })
}
