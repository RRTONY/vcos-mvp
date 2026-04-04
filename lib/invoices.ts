import { getSupabase } from '@/lib/supabase'

export async function buildInvoicesSnapshot() {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const invoices = (data ?? []).map((row) => ({
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

  return { invoices }
}
