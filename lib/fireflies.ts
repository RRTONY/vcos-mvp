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
