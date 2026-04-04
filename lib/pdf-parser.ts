// Braintrust PDF invoice parser
// Actual Braintrust invoice format:
//   INVOICE NUMBER: Ra-045-KD
//   REMIT TO: Accelerated Labs, Inc. ...
//   DATE: 03/16/26
//   DUE DATE: 03/31/26
//   BILL TO: RampRate ...
//   TALENT: Kimberly Dofredo
//   COMPANY NAME: RampRate A Team Inc.
//   PROJECT: Executive Administrator...
//   DATE RANGE ... DESCRIPTION ... UNIT PRICE  QTY  AMOUNT
//   2026-03-01 / 2026-03-15  -  Hours March 1-15, 2026  $12.50  68.13  $851.63
//   SUB-TOTAL: $851.63 / TOTAL: $851.63

export interface InvoiceRecord {
  contractor: string
  invoiceNumber: string
  period: string
  hours: number
  rate: number        // hourly rate — blinded from non-admins
  amount: number      // total — blinded from non-admins
  status: 'paid' | 'pending' | 'unknown'
  parsedAt: string
}

export async function parseBraintrustPdf(buffer: Buffer): Promise<InvoiceRecord[]> {
  // Use lib path directly — avoids pdf-parse loading its test PDF on import (Object.defineProperty error)
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const pdfParse: (b: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse') as any
  const data = await pdfParse(buffer)
  return extractInvoices(data.text)
}

function extractInvoices(text: string): InvoiceRecord[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  const record: Partial<InvoiceRecord> = {
    parsedAt: new Date().toISOString(),
    status: 'unknown',
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const next = lines[i + 1] ?? ''
    // stripped: removes all spaces so "I N VO I C E  N U M B E R" → "INVOICENUMBER"
    const stripped = line.replace(/\s/g, '')

    // Invoice number — line after "INVOICE NUMBER" (with or without letter spacing)
    if (/^INVOICENUMBER$/i.test(stripped)) {
      record.invoiceNumber = next
      i++
      continue
    }

    // Contractor name — line after "TALENT" (with or without letter spacing)
    if (/^TALENT$/i.test(stripped)) {
      record.contractor = next
      i++
      continue
    }

    // Period from date range lines like "2026-03-01" followed by "2026-03-15"
    // or description like "Hours March 1-15, 2026"
    if (/^\d{4}-\d{2}-\d{2}$/.test(line) && /^\d{4}-\d{2}-\d{2}$/.test(next)) {
      record.period = `${line} to ${next}`
      i++
      continue
    }

    // Description with period like "Hours March 1-15, 2026" or "RampRate and ImpactSoul Hours March 1-15, 2026"
    const descPeriod = line.match(/hours?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+[\d\-–]+,?\s*\d{4}/i)
    if (descPeriod && !record.period) {
      record.period = descPeriod[0]
    }

    // Amount line: "$12.50 68.13$851.63" or "$50.00 28.80 $1,440.00" — rate QTY amount
    const amtLine = line.match(/^\$([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*\$([\d,]+\.?\d*)$/)
    if (amtLine) {
      record.rate   = parseFloat(amtLine[1].replace(/,/g, ''))
      record.hours  = parseFloat(amtLine[2].replace(/,/g, ''))
      record.amount = parseFloat(amtLine[3].replace(/,/g, ''))
      continue
    }

    // Bare rate/qty/amount on separate lines: "$50.00" / "28.80" / "$1,440.00"
    const bareRate = line.match(/^\$([\d,]+\.?\d*)$/)
    if (bareRate && !record.rate) {
      const qty = lines[i + 1] ?? ''
      const amt = lines[i + 2] ?? ''
      const qtyMatch = qty.match(/^([\d,]+\.?\d*)$/)
      const amtMatch = amt.match(/^\$([\d,]+\.?\d*)$/)
      if (qtyMatch && amtMatch) {
        record.rate   = parseFloat(bareRate[1].replace(/,/g, ''))
        record.hours  = parseFloat(qtyMatch[1].replace(/,/g, ''))
        record.amount = parseFloat(amtMatch[1].replace(/,/g, ''))
        i += 2
        continue
      }
    }

    // TOTAL line as fallback for amount: "TOTAL" followed by "$851.63"
    if (/^TOTAL$/i.test(line)) {
      const totalAmt = next.match(/^\$([\d,]+\.?\d*)$/)
      if (totalAmt && !record.amount) {
        record.amount = parseFloat(totalAmt[1].replace(/,/g, ''))
        i++
      }
      continue
    }

    // Status
    if (/\bpaid\b/i.test(line)) record.status = 'paid'
    else if (/\bpending|unpaid|due\b/i.test(line)) record.status = 'pending'
  }

  // If amount found but no explicit status, mark as pending
  if (record.status === 'unknown' && record.amount) record.status = 'pending'

  if (!record.contractor && !record.invoiceNumber) return []

  return [finalise(record)]
}

function finalise(partial: Partial<InvoiceRecord>): InvoiceRecord {
  return {
    contractor:    partial.contractor    ?? 'Unknown',
    invoiceNumber: partial.invoiceNumber ?? `INV-${Date.now()}`,
    period:        partial.period        ?? '',
    hours:         partial.hours         ?? 0,
    rate:          partial.rate          ?? 0,
    amount:        partial.amount        ?? (partial.hours && partial.rate ? partial.hours * partial.rate : 0),
    status:        partial.status        ?? 'unknown',
    parsedAt:      partial.parsedAt      ?? new Date().toISOString(),
  }
}
