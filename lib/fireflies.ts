import { getTeamMembers } from './team-db'

const ENDPOINT = 'https://api.fireflies.ai/graphql'

async function ffQuery(query: string) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FIREFLIES_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Fireflies ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0]?.message ?? 'Fireflies error')
  return json
}

export async function getRecentTranscripts(limit = 10) {
  return ffQuery(`{
    transcripts(limit: ${limit}) {
      id
      title
      date
      duration
      participants
      summary {
        action_items
        overview
        keywords
      }
    }
  }`)
}

export async function buildFirefliesSnapshot() {
  const [data, teamMembers] = await Promise.all([
    getRecentTranscripts(10),
    getTeamMembers().catch(() => []),
  ])
  const raw = data?.data?.transcripts ?? []

  // email → display name map for team members with a fireflies_email set
  const emailToName = new Map<string, string>()
  for (const m of teamMembers) {
    if (m.fireflies_email) emailToName.set(m.fireflies_email.toLowerCase(), m.full_name)
  }

  const meetings = raw.map((t: {
    id: string
    title?: string
    date?: number
    duration?: number
    participants?: string[]
    summary?: { action_items?: string; overview?: string; keywords?: string[] }
  }) => {
    const participants: string[] = t.participants ?? []
    const matchedEmails: string[] = []
    const teamParticipants = participants
      .filter(e => {
        if (emailToName.has(e.toLowerCase())) { matchedEmails.push(e.toLowerCase()); return true }
        return false
      })
      .map(e => emailToName.get(e.toLowerCase())!)
    return {
      id: t.id,
      title: t.title ?? 'Untitled meeting',
      date: t.date ? new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
      startedAt: t.date ? new Date(t.date).toISOString() : null,
      duration: t.duration ? `${Math.round(t.duration / 60)} min` : '',
      participants,
      teamParticipants,
      matchedEmails,
      overview: t.summary?.overview ?? '',
      actionItems: t.summary?.action_items ?? '',
      keywords: t.summary?.keywords ?? [],
      url: `https://app.fireflies.ai/view/${t.id}`,
    }
  })

  return { meetings }
}

export async function pingFireflies() {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FIREFLIES_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: '{ user { name email } }' }),
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Fireflies ping ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0]?.message ?? 'Fireflies auth error')
  return json
}
