// POST /api/invoices/upload
// Admin only — accepts Braintrust PDF, parses it, creates ClickUp tasks
import { NextRequest, NextResponse } from 'next/server'
import { parseBraintrustPdf } from '@/lib/pdf-parser'
import { COOKIE_NAME, verifySession } from '@/lib/auth'
import { buildInvoicesSnapshot } from '@/app/api/invoices/route'
import { recordSuccess } from '@/lib/api-cache'

const LIST_ID = process.env.CLICKUP_INVOICE_LIST_ID ?? '901102575315'

export async function POST(req: NextRequest) {
  // RBAC — admin only
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null
  if (!session || !['admin', 'owner'].includes(session.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const apiKey = process.env.CLICKUP_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'CLICKUP_API_KEY not configured' }, { status: 500 })

  try {
    const formData = await req.formData()
    const file = formData.get('pdf') as File | null
    if (!file) return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 })
    if (!file.name.endsWith('.pdf')) return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const invoices = await parseBraintrustPdf(buffer)

    if (invoices.length === 0) {
      return NextResponse.json({ error: 'No invoice records found in PDF', invoices: [] }, { status: 422 })
    }

    // Create a ClickUp task per invoice record
    const created = await Promise.all(
      invoices.map(async (inv) => {
        const description = [
          `Contractor: ${inv.contractor}`,
          `Invoice: ${inv.invoiceNumber}`,
          `Period: ${inv.period}`,
          `Hours: ${inv.hours}`,
          `Rate: $${inv.rate}/hr`,
          `Amount: $${inv.amount}`,
          `Status: ${inv.status}`,
          `Parsed: ${inv.parsedAt}`,
          `Source: Braintrust PDF Upload`,
        ].join('\n')

        const res = await fetch(`https://api.clickup.com/api/v2/list/${LIST_ID}/task`, {
          method: 'POST',
          headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `[Invoice] ${inv.contractor} — ${inv.period || inv.invoiceNumber}`,
            description,
            tags: ['braintrust-invoice'],
            status: inv.status === 'paid' ? 'complete' : 'to do',
          }),
        })
        const d = await res.json()
        return { contractor: inv.contractor, taskId: d.id, url: d.url }
      })
    )

    // Bust the invoices cache so next GET returns fresh data
    const snapshot = await buildInvoicesSnapshot().catch(() => null)
    if (snapshot) await recordSuccess('invoices', snapshot)

    return NextResponse.json({ ok: true, count: created.length, created })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Parse error' }, { status: 500 })
  }
}
