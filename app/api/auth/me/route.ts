import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifySession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const session = await verifySession(token)
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  return NextResponse.json({ username: session.username, role: session.role })
}
