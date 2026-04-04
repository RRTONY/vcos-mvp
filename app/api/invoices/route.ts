// GET /api/invoices — reads directly from Supabase invoices table
import { NextResponse } from 'next/server'
import { buildInvoicesSnapshot } from '@/lib/invoices'

export async function GET() {
  try {
    const snapshot = await buildInvoicesSnapshot()
    return NextResponse.json(snapshot)
  } catch (err) {
    return NextResponse.json(
      { invoices: [], error: err instanceof Error ? err.message : 'Error' },
      { status: 500 }
    )
  }
}
