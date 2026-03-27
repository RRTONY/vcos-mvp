// GET /api/invoices
// Reads from Supabase cache. Cache is populated on first request or when stale (> 5 min).
// Admin upload (POST /api/invoices/upload) also refreshes the cache.

import { NextResponse } from 'next/server'
import { getCachedSWR, recordSuccess, recordFailure } from '@/lib/api-cache'
import { CACHE_TTL_INVOICES_MS } from '@/lib/constants'
import { buildInvoicesSnapshot } from '@/lib/invoices'

export async function GET() {
  const cached = await getCachedSWR('invoices', CACHE_TTL_INVOICES_MS)

  // Fresh cache — return immediately
  if (cached.data && !cached.stale) {
    return NextResponse.json({ ...cached.data })
  }

  // Stale or missing — try live fetch
  try {
    const snapshot = await buildInvoicesSnapshot()
    await recordSuccess('invoices', snapshot)
    return NextResponse.json(snapshot)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    await recordFailure('invoices', msg)
    // Return stale data if available, otherwise empty
    if (cached.data) {
      return NextResponse.json({
        ...cached.data,
        error: `Live fetch failed: ${msg}`,
        _stale: true,
        _ageMinutes: cached.ageMinutes,
      })
    }
    return NextResponse.json({ invoices: [], error: msg })
  }
}
