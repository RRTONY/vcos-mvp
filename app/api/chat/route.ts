// VCoS chatbot — streams Claude's reply, grounded in the VCoS brain (Tony's
// operating identity) + a live, role-scoped snapshot of VCOS data.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_STATIC, buildLiveBlock } from '@/lib/vcos-brain'
import { buildChatContext } from '@/lib/chat-context'
import { loadConversation, saveConversation, addCommitments, extractLogBlocks, stripLogBlocks } from '@/lib/memory'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const role = req.headers.get('x-role')
  const username = req.headers.get('x-user')
  if (!role || !username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  let body: { messages?: ChatMessage[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const messages = (body.messages ?? [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20) // keep the last 20 turns for context window hygiene
  if (!messages.length) return NextResponse.json({ error: 'No messages' }, { status: 400 })

  const isAdmin = ['admin', 'owner'].includes(role)
  let liveContext = ''
  try {
    liveContext = await buildChatContext(username, isAdmin)
  } catch {
    liveContext = '(Live VCOS data is temporarily unavailable — answer from general knowledge of the team and flag that the data feed is down.)'
  }
  // Cache the large static brain (identity + commands + rules) so it isn't
  // reprocessed every turn — faster time-to-first-token and lower cost. The
  // live data block changes each turn, so it stays uncached.
  const system = [
    { type: 'text' as const, text: SYSTEM_STATIC, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: buildLiveBlock(liveContext) },
  ]

  const client = new Anthropic({ apiKey })

  const lastUser = messages[messages.length - 1]

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder()
      let full = ''
      try {
        const ai = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          system,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        })
        ai.on('text', (delta) => { full += delta; controller.enqueue(enc.encode(delta)) })
        await ai.finalMessage()
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI request failed'
        controller.enqueue(enc.encode(`\n\n⚠️ ${msg}`))
        controller.close()
      }

      // Post-stream: extract logged commitments/decisions, then persist the
      // new exchange to memory (append to stored history). Failures here never
      // affect the response the user already received.
      try {
        const cleaned = stripLogBlocks(full)
        const logs = extractLogBlocks(full)
        if (logs.length) await addCommitments(logs, username)
        if (cleaned.trim() && !cleaned.startsWith('⚠️')) {
          const now = new Date().toISOString()
          const prior = await loadConversation(username)
          await saveConversation(username, [
            ...prior,
            { role: 'user', content: lastUser.content, at: now },
            { role: 'assistant', content: cleaned, at: now },
          ])
        }
      } catch { /* best-effort persistence */ }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
