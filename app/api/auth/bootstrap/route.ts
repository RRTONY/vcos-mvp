import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/password'
import { getUsers } from '@/lib/auth'

// One-time migration: seeds AUTH_USERS env var into Supabase vcos_users table
// POST /api/auth/bootstrap  (admin only)
export async function POST(req: NextRequest) {
  if (req.headers.get('x-role') !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const users = getUsers()
  const results: { username: string; status: string }[] = []

  for (const [username, { password, role }] of Object.entries(users)) {
    // Skip if already exists
    const { data: existing } = await supabase
      .from('vcos_users')
      .select('id')
      .eq('username', username)
      .single()

    if (existing) {
      results.push({ username, status: 'already_exists' })
      continue
    }

    const password_hash = await hashPassword(password)
    const { error } = await supabase.from('vcos_users').insert({
      username,
      role,
      password_hash,
      status: 'active',
      approved_by: 'bootstrap',
    })

    results.push({ username, status: error ? `error: ${error.message}` : 'created' })
  }

  return NextResponse.json({ results })
}
