// POST /api/compliance/remind
// Admin/owner only. Sends a personalized Slack DM to each missing member.
// Resolves each member's Slack user ID via (1) team_members.slack_user_id,
// (2) email match against the workspace, (3) real-name match. Anyone who can't
// be resolved is returned in `skipped` so the UI can fall back to a channel post.
import { NextRequest, NextResponse } from 'next/server'
import { getTeamMembers } from '@/lib/team-db'
import { usersList, postMessage } from '@/lib/slack'

interface SlackUser {
  id: string
  deleted?: boolean
  is_bot?: boolean
  real_name?: string
  profile?: { email?: string; real_name?: string; display_name?: string }
}

export async function POST(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!['admin', 'owner'].includes(role ?? '')) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  if (!process.env.SLACK_BOT_TOKEN) {
    return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 500 })
  }

  let names: string[] = []
  try {
    const body = await req.json()
    names = Array.isArray(body?.names) ? body.names : []
  } catch { /* ignore */ }
  if (!names.length) return NextResponse.json({ error: 'names required' }, { status: 400 })

  const [members, slackUsers] = await Promise.all([
    getTeamMembers(),
    usersList().then((r: { members?: SlackUser[] }) => r.members ?? []).catch(() => [] as SlackUser[]),
  ])

  // Build email → id and real-name → id maps from the live workspace.
  const byEmail = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const u of slackUsers) {
    if (u.deleted || u.is_bot) continue
    const email = u.profile?.email?.toLowerCase()
    if (email) byEmail.set(email, u.id)
    const real = (u.profile?.real_name ?? u.real_name ?? '').toLowerCase()
    if (real) byName.set(real, u.id)
  }

  const base = process.env.NEXT_PUBLIC_URL ?? process.env.URL ?? ''
  const dmed: string[] = []
  const skipped: string[] = []

  for (const name of names) {
    const m = members.find(x => x.full_name === name)
    let uid = m?.slack_user_id ?? null
    if (!uid && m?.email) uid = byEmail.get(m.email.toLowerCase()) ?? null
    if (!uid) uid = byName.get(name.toLowerCase()) ?? null
    if (!uid) { skipped.push(name); continue }

    const first = name.split(' ')[0]
    const text = `👋 Hi ${first} — your weekly report isn't in yet for this week. Please file it here: ${base}/submit`
    try {
      await postMessage(uid, text)
      dmed.push(name)
    } catch {
      skipped.push(name)
    }
  }

  return NextResponse.json({ ok: true, dmed, skipped })
}
