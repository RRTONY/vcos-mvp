import { NextRequest, NextResponse } from 'next/server'
import { createSession, COOKIE_NAME } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { verifyPassword } from '@/lib/password'

export const dynamic = 'force-dynamic'

const IS_PROD = process.env.NODE_ENV === 'production'
const DAYS_30 = 30 * 24 * 60 * 60 // seconds

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
    }

    // Accept either a username or an email as the login identifier
    const identifier = username.toLowerCase().trim()

    let { data: user } = await supabase
      .from('vcos_users')
      .select('username, password_hash, role, status')
      .eq('username', identifier)
      .maybeSingle()

    // Fall back to matching by email if no username matched
    if (!user) {
      ;({ data: user } = await supabase
        .from('vcos_users')
        .select('username, password_hash, role, status')
        .eq('email', identifier)
        .maybeSingle())
    }

    if (!user || user.status !== 'active') {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const ok = await verifyPassword(password, user.password_hash)
    if (!ok) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    // Always key the session on the real username, even when login was by email
    const token = await createSession(user.username, user.role)
    const res = NextResponse.json({ ok: true, username: user.username, role: user.role })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      maxAge: DAYS_30,
      path: '/',
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
