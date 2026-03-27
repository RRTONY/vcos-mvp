import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!['admin', 'owner'].includes(req.headers.get('x-role') ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Reset entered_stage_at when stage changes so stuck-deal timer restarts
  const payload = body.stage
    ? { ...body, entered_stage_at: new Date().toISOString().split('T')[0] }
    : body

  const { error } = await supabase.from('vcos_bd_deals').update(payload).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!['admin', 'owner'].includes(req.headers.get('x-role') ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.from('vcos_bd_deals').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
