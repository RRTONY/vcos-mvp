import { NextResponse } from 'next/server'
import { getRecentTranscripts } from '@/lib/fireflies'

export async function GET() {
  if (!process.env.FIREFLIES_API_KEY) {
    return NextResponse.json({ error: 'FIREFLIES_API_KEY not configured', meetings: [] })
  }

  try {
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

    return NextResponse.json({ meetings })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg, meetings: [] }, { status: 500 })
  }
}
