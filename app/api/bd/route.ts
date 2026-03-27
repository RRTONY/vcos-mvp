import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('vcos_bd_deals')
    .select('*')
    .order('score', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const deals = data ?? []
  const today = new Date()

  // Weighted pipeline value = SUM(year1_value * probability_pct / 100) for active+warm+cold
  const weightedPipeline = deals.reduce((sum, d) => {
    if (d.stage === 'Deferred') return sum
    const val = Number(d.year1_value ?? 0)
    const prob = Number(d.probability_pct ?? 0)
    return sum + (val * prob / 100)
  }, 0)

  // Total unweighted pipeline
  const totalPipeline = deals
    .filter(d => d.stage !== 'Deferred')
    .reduce((sum, d) => sum + Number(d.year1_value ?? 0), 0)

  // Deals gone cold: last_contact > 14 days ago (or never contacted and entered > 14 days ago)
  const goneCold = deals.filter(d => {
    if (d.stage === 'Deferred') return false
    if (d.last_contact) {
      const days = (today.getTime() - new Date(d.last_contact).getTime()) / 86400000
      return days > 14
    }
    if (d.entered_stage_at) {
      const days = (today.getTime() - new Date(d.entered_stage_at).getTime()) / 86400000
      return days > 14
    }
    return false
  }).length

  // Deals stuck: in same stage > 21 days
  const stuck = deals.filter(d => {
    if (d.stage === 'Deferred') return false
    if (!d.entered_stage_at) return false
    const days = (today.getTime() - new Date(d.entered_stage_at).getTime()) / 86400000
    return days > 21
  }).length

  return NextResponse.json({
    deals,
    metrics: {
      weightedPipeline: Math.round(weightedPipeline),
      totalPipeline: Math.round(totalPipeline),
      totalDeals: deals.filter(d => d.stage !== 'Deferred').length,
      goneCold,
      stuck,
    },
  })
}

export async function POST(req: NextRequest) {
  if (!['admin', 'owner'].includes(req.headers.get('x-role') ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Auto-set entered_stage_at when creating
  const payload = {
    ...body,
    entered_stage_at: new Date().toISOString().split('T')[0],
  }

  const { data, error } = await supabase
    .from('vcos_bd_deals')
    .insert(payload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
