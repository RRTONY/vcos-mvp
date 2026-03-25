// Braintrust PDF invoice parser
// Braintrust invoice PDFs typically contain:
//   Contractor name, invoice number, period, hours, rate, amount, payment status

export interface InvoiceRecord {
  contractor: string
  invoiceNumber: string
  period: string      // e.g. "Mar 1–15, 2026"
  hours: number
  rate: number        // hourly rate — blinded from non-admins
  amount: number      // total — blinded from non-admins
  status: 'paid' | 'pending' | 'unknown'
  parsedAt: string
}

export async function parseBraintrustPdf(buffer: Buffer): Promise<InvoiceRecord[]> {
  // Dynamically import pdf-parse (server-side only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse: any = await import('pdf-parse')
  const parse = pdfParse.default ?? pdfParse
  const data = await parse(buffer)
  const text = data.text

  return extractInvoices(text)
}

function extractInvoices(text: string): InvoiceRecord[] {
  const records: InvoiceRecord[] = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Braintrust PDF structure varies, but common patterns:
  // "Invoice #INV-XXXXXX"
  // "Contractor: Full Name"
  // "Period: Mar 1 - Mar 15, 2026"
  // "Hours: 40.00"
  // "Rate: $125.00/hr"
  // "Total: $5,000.00"
  // "Status: Paid"

  let current: Partial<InvoiceRecord> = {}
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Invoice number
    const invMatch = line.match(/invoice\s*#?\s*(INV-[\w-]+)/i)
    if (invMatch) {
      if (current.invoiceNumber) {
        records.push(finalise(current))
        current = {}
      }
      current.invoiceNumber = invMatch[1]
      current.parsedAt = new Date().toISOString()
    }

    // Contractor name
    const nameMatch = line.match(/^contractor[:\s]+(.+)/i) ||
                      line.match(/^contractor name[:\s]+(.+)/i) ||
                      line.match(/^name[:\s]+(.+)/i)
    if (nameMatch) current.contractor = nameMatch[1].trim()

    // Period
    const periodMatch = line.match(/^(?:period|billing period|dates?)[:\s]+(.+)/i)
    if (periodMatch) current.period = periodMatch[1].trim()

    // Hours
    const hoursMatch = line.match(/^(?:hours|total hours)[:\s]+([\d.]+)/i)
    if (hoursMatch) current.hours = parseFloat(hoursMatch[1])

    // Rate
    const rateMatch = line.match(/^(?:rate|hourly rate)[:\s]+\$?([\d,]+(?:\.\d+)?)/i)
    if (rateMatch) current.rate = parseFloat(rateMatch[1].replace(/,/g, ''))

    // Amount / Total
    const amtMatch = line.match(/^(?:total|amount|subtotal)[:\s]+\$?([\d,]+(?:\.\d+)?)/i)
    if (amtMatch) current.amount = parseFloat(amtMatch[1].replace(/,/g, ''))

    // Status
    if (/paid/i.test(line)) current.status = 'paid'
    else if (/pending|unpaid|due/i.test(line)) current.status = 'pending'

    i++
  }

  if (current.invoiceNumber || current.contractor) {
    records.push(finalise(current))
  }

  return records
}

function finalise(partial: Partial<InvoiceRecord>): InvoiceRecord {
  return {
    contractor: partial.contractor ?? 'Unknown',
    invoiceNumber: partial.invoiceNumber ?? `INV-${Date.now()}`,
    period: partial.period ?? '',
    hours: partial.hours ?? 0,
    rate: partial.rate ?? 0,
    amount: partial.amount ?? (partial.hours && partial.rate ? partial.hours * partial.rate : 0),
    status: partial.status ?? 'unknown',
    parsedAt: partial.parsedAt ?? new Date().toISOString(),
  }
}
