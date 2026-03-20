import { NextResponse } from 'next/server'
import { channelHistory, usersList, conversationsList } from '@/lib/slack'

const WEEKLY_REPORTS_CHANNEL = 'C08K6KM53FV'
const FULL_TEAM = ['Rob Holmes', 'Alex Veytsel', 'Josh Bykowski', 'Kim', 'Chase', 'Daniel Baez', 'Ben Sheppard', 'Tony']

// Maps display name → Slack real_name / username patterns to match against
// Slack real_name comes from usersList(); username (name field) is the handle
const SLACK_MATCH: Record<string, string[]> = {
  'Rob Holmes':    ['rob holmes', 'rob'],
  'Alex Veytsel':  ['alex veytsel', 'alex'],
  'Josh Bykowski': ['josh bykowski', 'josh'],
  'Kim':           ['kimberly dofredo', 'kimberly', 'kim'],
  'Chase':         ['chase adrian', 'chase'],
  'Daniel Baez':   ['daniel baez', 'daniel'],
  'Ben Sheppard':  ['ben sheppard', 'ben'],
  'Tony':          ['tony greenberg', 'rampratetony', 'tonyg', 'tony'],
}

function weekLabel() {
  const now = new Date()
  const mon = new Date(now)
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[mon.getMonth()]} ${mon.getDate()}–${sun.getDate()}`
}

export async function GET() {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    return NextResponse.json({
      weeklyReports: { filed: [], missing: FULL_TEAM, week: weekLabel() },
      slackStats: { totalMessages: 0, activeMembers: 0, channels: 0 },
      error: 'SLACK_BOT_TOKEN not configured',
    })
  }

  try {
    const oldest = String(Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000))

    // 3 API calls total — no per-user calls
    const [historyData, membersData, channelsData] = await Promise.all([
      channelHistory(WEEKLY_REPORTS_CHANNEL, oldest),
      usersList(),
      conversationsList(),
    ])

    // Build ID→name map from the usersList we already fetched
    const allUsers: Array<{ id: string; real_name?: string; name?: string; deleted?: boolean; is_bot?: boolean }> =
      membersData.members ?? []

    const userMap: Record<string, string> = {}
    for (const u of allUsers) {
      if (u.id) userMap[u.id] = u.real_name ?? u.name ?? ''
    }

    const messages: Array<{ user?: string }> = historyData.messages ?? []
    const posters = Array.from(new Set(
      messages.map((m) => (m.user ? userMap[m.user] : '')).filter(Boolean)
    ))

    // Also build handle map (name field = Slack username/handle)
    const handleMap: Record<string, string> = {}
    for (const u of allUsers) {
      if (u.id) handleMap[u.id] = u.name ?? ''
    }
    const posterHandles = Array.from(new Set(
      messages.map((m) => (m.user ? handleMap[m.user] : '')).filter(Boolean)
    ))

    const filed: string[] = []
    const missing: string[] = []
    for (const member of FULL_TEAM) {
      const aliases = SLACK_MATCH[member] ?? [member.split(' ')[0].toLowerCase()]
      const didFile =
        posters.some((p) => aliases.some((a) => p.toLowerCase().includes(a))) ||
        posterHandles.some((h) => aliases.some((a) => h.toLowerCase().includes(a)))
      if (didFile) filed.push(member)
      else missing.push(member)
    }

    const activeMembers = allUsers.filter((m) => !m.deleted && !m.is_bot).length

    return NextResponse.json({
      weeklyReports: { filed, missing, week: weekLabel() },
      slackStats: {
        totalMessages: messages.length,
        activeMembers,
        channels: (channelsData.channels ?? []).length,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
