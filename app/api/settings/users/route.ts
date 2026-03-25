import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword, generateTempPassword } from '@/lib/password'

function adminOnly(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export async function GET(req: NextRequest) {
  const deny = adminOnly(req)
  if (deny) return deny

  const { data, error } = await supabase
    .from('vcos_users')
    .select('id, username, email, role, status, approved_by, created_at')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const deny = adminOnly(req)
  if (deny) return deny

  const admin = req.headers.get('x-user') ?? 'admin'
  const { username, email, role = 'user', password } = await req.json()

  if (!username) return NextResponse.json({ error: 'Username required' }, { status: 400 })

  const plainPassword = password || generateTempPassword()
  const password_hash = await hashPassword(plainPassword)

  const { data, error } = await supabase
    .from('vcos_users')
    .insert({ username: username.toLowerCase(), email, role, password_hash, status: 'active', approved_by: admin })
    .select('id, username, email, role, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data, tempPassword: plainPassword }, { status: 201 })
}
