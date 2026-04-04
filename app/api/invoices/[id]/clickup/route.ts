// POST /api/invoices/[id]/clickup
// Admin only — creates a ClickUp task for an invoice not yet linked, then saves task ID back to Supabase
import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifySession } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'

const LIST_ID = process.env.CLICKUP_INVOICE_LIST_ID ?? '901113518927'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null
  if (!session || !['admin', 'owner'].includes(session.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const apiKey = process.env.CLICKUP_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'CLICKUP_API_KEY not configured' }, { status: 500 })

  const { id } = await params
  const sb = getSupabase()

  const { data: inv, error: fetchErr } = await sb
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (inv.clickup_task_id) return NextResponse.json({ error: 'Already linked to ClickUp' }, { status: 409 })

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

  if (!res.ok) return NextResponse.json({ error: `ClickUp error ${res.status}` }, { status: 502 })
  const task = await res.json()

  await sb.from('invoices').update({
    clickup_task_id: task.id,
    clickup_url: task.url ?? `https://app.clickup.com/t/${task.id}`,
  }).eq('id', id)

  return NextResponse.json({ ok: true, taskId: task.id, url: task.url })
}
