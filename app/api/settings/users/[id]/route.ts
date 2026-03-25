import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword, generateTempPassword } from '@/lib/password'

function adminOnly(req: NextRequest) {
  if (req.headers.get('x-role') !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const deny = adminOnly(req)
  if (deny) return deny

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.role) updates.role = body.role
  if (body.status) updates.status = body.status
  if (body.email !== undefined) updates.email = body.email
  if (body.resetPassword) {
    const plain = generateTempPassword()
    updates.password_hash = await hashPassword(plain)
    const { error } = await supabase.from('vcos_users').update(updates).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, tempPassword: plain })
  }

  const { error } = await supabase.from('vcos_users').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const deny = adminOnly(req)
  if (deny) return deny

  // Soft delete — set status to inactive
  const { error } = await supabase.from('vcos_users').update({ status: 'inactive' }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
