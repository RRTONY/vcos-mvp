// Decision & commitment log. Everyone can read; admins resolve/add.
import { NextRequest, NextResponse } from 'next/server'
import { loadCommitments, setCommitmentStatus, addCommitments } from '@/lib/memory'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!req.headers.get('x-role')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await loadCommitments().catch(() => [])
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const role = req.headers.get('x-role') ?? ''
  const username = req.headers.get('x-user') ?? 'unknown'
  if (!['admin', 'owner'].includes(role)) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  // Resolve / reopen an existing item.
  if (body.id && (body.status === 'open' || body.status === 'done')) {
    const items = await setCommitmentStatus(body.id, body.status)
    return NextResponse.json({ ok: true, items })
  }
  // Manually add a commitment/decision.
  if (typeof body.text === 'string' && body.text.trim()) {
    const items = await addCommitments([{ type: body.type, text: body.text, owner: body.owner ?? null, due: body.due ?? null }], username)
    return NextResponse.json({ ok: true, items })
  }
  return NextResponse.json({ error: 'Provide {id,status} to update or {text} to add' }, { status: 400 })
}
