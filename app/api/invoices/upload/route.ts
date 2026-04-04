// POST /api/invoices/upload
// Admin only — parses Braintrust PDF, stores to Supabase, auto-pushes to ClickUp
import { NextRequest, NextResponse } from 'next/server'
import { parseBraintrustPdf } from '@/lib/pdf-parser'
import { COOKIE_NAME, verifySession } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
const LIST_ID = process.env.CLICKUP_INVOICE_LIST_ID ?? '901113518927'

async function pushToClickUp(inv: {
  id: string
  contractor: string
  invoice_number: string
  period: string
  hours: number
  rate: number
  amount: number
  status: string
  parsed_at: string
}, apiKey: string): Promise<{ taskId: string; url: string } | { error: string }> {
  const description = [
    `Contractor: ${inv.contractor}`,
    `Invoice: ${inv.invoice_number}`,
    `Period: ${inv.period}`,
    `Hours: ${inv.hours}`,
    `Rate: $${inv.rate}/hr`,
    `Amount: $${inv.amount}`,
    `Status: ${inv.status}`,
    `Parsed: ${inv.parsed_at}`,
    `Source: Braintrust PDF Upload`,
  ].join('\n')

  try {
    const res = await fetch(`https://api.clickup.com/api/v2/list/${LIST_ID}/task`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `[Invoice] ${inv.contractor} — ${inv.period || inv.invoice_number}`,
        description,
        tags: ['braintrust-invoice'],
        status: inv.status === 'paid' ? 'paid' : 'pending',
      }),
    })
    if (!res.ok) return { error: `ClickUp responded with ${res.status} ${res.statusText}` }
    const task = await res.json()
    if (!task.id) return { error: 'ClickUp returned no task ID — check API key permissions' }
    return { taskId: task.id, url: task.url ?? `https://app.clickup.com/t/${task.id}` }
  } catch (e) {
    return { error: `Network error reaching ClickUp: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null
  if (!session || !['admin', 'owner'].includes(session.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('pdf') as File | null
    if (!file) return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 })
    if (!file.name.endsWith('.pdf')) return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const invoices = await parseBraintrustPdf(buffer)

    if (invoices.length === 0) {
      return NextResponse.json({ error: 'No invoice records found in PDF. Make sure this is a Braintrust invoice.' }, { status: 422 })
    }

    const sb = getSupabase()
    const rows = invoices.map((inv) => ({
      contractor:     inv.contractor,
      invoice_number: inv.invoiceNumber,
      period:         inv.period,
      hours:          inv.hours,
      rate:           inv.rate,
      amount:         inv.amount,
      status:         inv.status,
      parsed_at:      inv.parsedAt,
    }))

    const { data: inserted, error: dbError } = await sb.from('invoices').insert(rows).select()
    if (dbError) throw new Error(`Failed to save invoice: ${dbError.message}`)

    // Auto-push each saved invoice to ClickUp
    const apiKey = process.env.CLICKUP_API_KEY
    const clickupWarnings: string[] = []

    if (apiKey && inserted) {
      await Promise.all(inserted.map(async (row) => {
        const result = await pushToClickUp(row, apiKey)
        if ('error' in result) {
          clickupWarnings.push(`Invoice ${row.invoice_number}: ${result.error}`)
        } else {
          await sb.from('invoices').update({
            clickup_task_id: result.taskId,
            clickup_url: result.url,
          }).eq('id', row.id)
        }
      }))
    } else if (!apiKey) {
      clickupWarnings.push('CLICKUP_API_KEY is not configured — invoice saved but not sent to ClickUp')
    }

    // Re-read inserted rows (now with clickup fields populated) to return to client
    const { data: finalRows } = await sb
      .from('invoices')
      .select('*')
      .in('id', (inserted ?? []).map((r) => r.id))
      .order('created_at', { ascending: false })

    const returnedInvoices = (finalRows ?? []).map((row) => ({
      id:            row.id,
      contractor:    row.contractor,
      invoiceNumber: row.invoice_number,
      period:        row.period ?? '',
      hours:         row.hours ?? 0,
      rate:          row.rate ?? 0,
      amount:        row.amount ?? 0,
      status:        row.status ?? 'unknown',
      parsedAt:      row.parsed_at ?? '',
      clickupTaskId: row.clickup_task_id ?? null,
      clickupUrl:    row.clickup_url ?? null,
    }))

    return NextResponse.json({
      ok: true,
      count: returnedInvoices.length,
      invoices: returnedInvoices,
      clickupWarnings: clickupWarnings.length > 0 ? clickupWarnings : undefined,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Parse error' }, { status: 500 })
  }
}
