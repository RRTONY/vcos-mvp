// Conversation memory for the current user — load on page open, clear on demand.
import { NextRequest, NextResponse } from 'next/server'
import { loadConversation, clearConversation } from '@/lib/memory'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const username = req.headers.get('x-user')
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const messages = await loadConversation(username).catch(() => [])
  return NextResponse.json({ messages })
}

export async function DELETE(req: NextRequest) {
  const username = req.headers.get('x-user')
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await clearConversation(username).catch(() => {})
  return NextResponse.json({ ok: true })
}
