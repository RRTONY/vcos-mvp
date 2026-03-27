import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export interface HealthRow {
  source: string
  fetched_at: string
  age_minutes: number
  consecutive_failures: number
  last_error: string | null
  last_error_at: string | null
  health: 'ok' | 'stale' | 'dead' | 'circuit_open'
}

export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('vcos_api_health')
    .select('*')
    .order('source')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ health: data ?? [] })
}
