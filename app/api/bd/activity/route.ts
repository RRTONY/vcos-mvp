import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/bd/activity?deal_id=xxx
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dealId = req.nextUrl.searchParams.get('deal_id')
  if (!dealId) return NextResponse.json({ error: 'deal_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('vcos_bd_activity')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/bd/activity
export async function POST(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { deal_id, type, summary, by } = body

  if (!deal_id || !type || !summary) {
    return NextResponse.json({ error: 'deal_id, type, and summary required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('vcos_bd_activity')
    .insert({ deal_id, type, summary, by: by || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
