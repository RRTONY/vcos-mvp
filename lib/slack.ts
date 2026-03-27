const BASE = 'https://slack.com/api'

function headers() {
  return {
    Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN ?? ''}`,
    'Content-Type': 'application/json',
  }
}

export async function slackGet(method: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}/${method}${qs ? '?' + qs : ''}`, {
    headers: headers(),
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Slack ${method} ${res.status}`)
  return res.json()
}

export async function postMessage(channel: string, text: string) {
  const res = await fetch(`${BASE}/chat.postMessage`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ channel, text }),
  })
  if (!res.ok) throw new Error(`Slack postMessage ${res.status}`)
  return res.json()
}

export async function authTest() {
  return slackGet('auth.test')
}

export async function channelHistory(channel: string, oldest: string, limit = '100') {
  return slackGet('conversations.history', { channel, oldest, limit })
}

export async function userInfo(user: string) {
  return slackGet('users.info', { user })
}

export async function usersList() {
  return slackGet('users.list')
}

export async function conversationsList() {
  // channels:read scope — public channels only
  return slackGet('conversations.list', {
    types: 'public_channel',
    limit: '200',
  })
}

const WEEKLY_REPORTS_CHANNEL = 'C08K6KM53FV'
const FULL_TEAM = ['Rob Holmes', 'Alex Veytsel', 'Josh Bykowski', 'Kim', 'Chase', 'Daniel Baez', 'Ben Sheppard', 'Tony']

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

export { FULL_TEAM, weekLabel }

export async function buildSlackSnapshot() {
  const oldest = String(Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000))

  const [historyData, membersData, channelsData] = await Promise.all([
    channelHistory(WEEKLY_REPORTS_CHANNEL, oldest),
    usersList(),
    conversationsList(),
  ])

  const allUsers: Array<{ id: string; real_name?: string; name?: string; deleted?: boolean; is_bot?: boolean }> =
    (membersData as { members?: typeof allUsers }).members ?? []

  const userMap: Record<string, string> = {}
  const handleMap: Record<string, string> = {}
  for (const u of allUsers) {
    if (u.id) {
      userMap[u.id] = u.real_name ?? u.name ?? ''
      handleMap[u.id] = u.name ?? ''
    }
  }

  const messages: Array<{ user?: string }> = (historyData as { messages?: typeof messages }).messages ?? []
  const posters = Array.from(new Set(messages.map(m => m.user ? userMap[m.user] : '').filter(Boolean)))
  const posterHandles = Array.from(new Set(messages.map(m => m.user ? handleMap[m.user] : '').filter(Boolean)))

  const filed: string[] = []
  const missing: string[] = []
  for (const member of FULL_TEAM) {
    const aliases = SLACK_MATCH[member] ?? [member.split(' ')[0].toLowerCase()]
    const didFile =
      posters.some(p => aliases.some(a => p.toLowerCase().includes(a))) ||
      posterHandles.some(h => aliases.some(a => h.toLowerCase().includes(a)))
    if (didFile) filed.push(member)
    else missing.push(member)
  }

  return {
    weeklyReports: { filed, missing, week: weekLabel() },
    slackStats: {
      totalMessages: messages.length,
      activeMembers: allUsers.filter(m => !m.deleted && !m.is_bot).length,
      channels: ((channelsData as { channels?: unknown[] }).channels ?? []).length,
    },
  }
}
