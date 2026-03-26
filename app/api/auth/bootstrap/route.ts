import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/password'

// Seed all users into Supabase vcos_users table
// POST /api/auth/bootstrap  (admin session required via cookie — run once after deploy)
const SEED_USERS = [
  { username: 'tony',     password: 'vcos2026', role: 'admin' },
  { username: 'ramprate', password: 'vcos2026', role: 'admin' },
  { username: 'kim',      password: 'vcos2026', role: 'admin' },
  { username: 'chase',    password: 'vcos2026', role: 'admin' },
  { username: 'rob',      password: 'vcos2026', role: 'user' },
  { username: 'alex',     password: 'vcos2026', role: 'user' },
  { username: 'josh',     password: 'vcos2026', role: 'user' },
  { username: 'daniel',   password: 'vcos2026', role: 'user' },
  { username: 'ben',      password: 'vcos2026', role: 'user' },
]

export async function POST(req: NextRequest) {
  if (req.headers.get('x-role') !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results: { username: string; status: string }[] = []

  for (const u of SEED_USERS) {
    const { data: existing } = await supabase
      .from('vcos_users')
      .select('id')
      .eq('username', u.username)
      .single()

    if (existing) {
      results.push({ username: u.username, status: 'already_exists' })
      continue
    }

    const password_hash = await hashPassword(u.password)
    const { error } = await supabase.from('vcos_users').insert({
      username: u.username,
      role: u.role,
      password_hash,
      status: 'active',
      approved_by: 'bootstrap',
    })

    results.push({ username: u.username, status: error ? `error: ${error.message}` : 'created' })
  }

  return NextResponse.json({ results })
}
