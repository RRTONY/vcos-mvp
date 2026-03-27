// GET /api/invoices
// Reads from Supabase cache. Cache is populated on first request or when stale (> 5 min).
// Admin upload (POST /api/invoices/upload) also refreshes the cache.

import { NextResponse } from 'next/server'
import { getCachedSWR, recordSuccess, recordFailure } from '@/lib/api-cache'
import { CACHE_TTL_INVOICES_MS } from '@/lib/constants'

const LIST_ID = process.env.CLICKUP_INVOICE_LIST_ID ?? '901102575315'

interface CUTask {
  id: string
  name: string
  description?: string
  custom_fields?: Array<{ name: string; value?: string | number }>
  tags?: Array<{ name: string }>
  date_created?: string
  status?: { status?: string }
}

function extractField(task: CUTask, ...names: string[]): string {
  for (const name of names) {
    const f = task.custom_fields?.find(cf =>
      cf.name.toLowerCase().includes(name.toLowerCase())
    )
    if (f?.value != null) return String(f.value)
  }
  if (task.description) {
    for (const name of names) {
      const m = task.description.match(new RegExp(`${name}[:\\s]+([^\\n]+)`, 'i'))
      if (m) return m[1].trim()
    }
  }
  return ''
}

export async function buildInvoicesSnapshot() {
  const apiKey = process.env.CLICKUP_API_KEY
  if (!apiKey) throw new Error('CLICKUP_API_KEY not configured')

  const res = await fetch(
    `https://api.clickup.com/api/v2/list/${LIST_ID}/task?tags[]=braintrust-invoice&include_closed=true`,
    { headers: { Authorization: apiKey }, next: { revalidate: 0 } }
  )
  if (!res.ok) throw new Error(`ClickUp ${res.status}`)
  const data = await res.json()
  const tasks: CUTask[] = data.tasks ?? []

  const invoices = tasks
    .filter((t: CUTask) => t.tags?.some(tag => tag.name === 'braintrust-invoice'))
    .map((t: CUTask) => ({
      id: t.id,
      contractor: extractField(t, 'contractor', 'name'),
      invoiceNumber: extractField(t, 'invoice', 'inv'),
      period: extractField(t, 'period', 'dates'),
      hours: parseFloat(extractField(t, 'hours') || '0') || 0,
      rate: parseFloat(extractField(t, 'rate') || '0') || 0,
      amount: parseFloat(extractField(t, 'amount', 'total') || '0') || 0,
      status: extractField(t, 'status') || t.status?.status || 'unknown',
      parsedAt: t.date_created ? new Date(parseInt(t.date_created)).toISOString() : '',
      clickupUrl: `https://app.clickup.com/t/${t.id}`,
    }))

  return { invoices }
}

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
