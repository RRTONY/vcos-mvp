import { NextRequest, NextResponse } from 'next/server'
import { validateCredentials, createSession, COOKIE_NAME } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { verifyPassword } from '@/lib/password'

const IS_PROD = process.env.NODE_ENV === 'production'
const DAYS_30 = 30 * 24 * 60 * 60 // seconds

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
    }

    const uname = username.toLowerCase().trim()
    let role: string | null = null

    // 1. Try Supabase first
    try {
      const { data: user } = await supabase
        .from('vcos_users')
        .select('password_hash, role, status')
        .eq('username', uname)
        .single()

      if (user && user.status === 'active') {
        const ok = await verifyPassword(password, user.password_hash)
        if (ok) role = user.role
      }
    } catch {
      // Supabase unavailable — fall through to legacy
    }

    // 2. Fallback to AUTH_USERS env var
    if (!role) {
      role = validateCredentials(uname, password)
    }

    if (!role) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const token = await createSession(uname, role)
    const res = NextResponse.json({ ok: true, username: uname, role })
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
