import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { name, email, username_requested, role_requested, message } = await req.json()
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const { error } = await supabase.from('vcos_signup_requests').insert({
      name,
      email,
      username_requested,
      role_requested: role_requested || 'user',
      message,
      status: 'pending',
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Notify admin on Slack
    try {
      const slackToken = process.env.SLACK_BOT_TOKEN
      const adminChannel = process.env.SLACK_ADMIN_CHANNEL ?? 'C000000'
      if (slackToken) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${slackToken}` },
          body: JSON.stringify({
            channel: adminChannel,
            text: `🔔 New VCOS access request from *${name}*${email ? ` (${email})` : ''}\nRequested username: ${username_requested || '—'} · Role: ${role_requested || 'user'}\n${message ? `Message: ${message}` : ''}\nApprove at /settings/requests`,
          }),
        })
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
