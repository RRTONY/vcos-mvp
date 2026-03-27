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
  const data = await getRecentTranscripts(10)
  const raw = data?.data?.transcripts ?? []

  const meetings = raw.map((t: {
    id: string
    title?: string
    date?: number
    duration?: number
    participants?: string[]
    summary?: { action_items?: string; overview?: string; keywords?: string[] }
  }) => ({
    id: t.id,
    title: t.title ?? 'Untitled meeting',
    date: t.date ? new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
    duration: t.duration ? `${Math.round(t.duration / 60)} min` : '',
    participants: t.participants ?? [],
    overview: t.summary?.overview ?? '',
    actionItems: t.summary?.action_items ?? '',
    keywords: t.summary?.keywords ?? [],
    url: `https://app.fireflies.ai/view/${t.id}`,
  }))

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
