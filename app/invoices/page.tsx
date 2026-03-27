'use client'

import { useEffect, useState, useRef } from 'react'
import { useRefresh } from '@/components/RefreshContext'
import { useMe } from '@/hooks/useMe'

interface Invoice {
  id: string
  contractor: string
  invoiceNumber: string
  period: string
  hours: number
  rate: number      // admin-only
  amount: number    // admin-only
  status: string
  parsedAt: string
  clickupUrl?: string
}

const STATUS_STYLE: Record<string, string> = {
  paid:    'bg-black text-white',
  pending: 'bg-sand2 text-ink3 border border-sand3',
  unknown: 'bg-sand2 text-ink4 border border-sand3',
}

export default function InvoicesPage() {
  const { me, isAdmin, isOwner } = useMe()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const { refreshKey } = useRefresh()

  useEffect(() => {
    setLoading(true)
    fetch('/api/invoices', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setInvoices(d.invoices ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [refreshKey])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg('')
    const form = new FormData()
    form.append('pdf', file)
    try {
      const res = await fetch('/api/invoices/upload', { method: 'POST', body: form })
      const d = await res.json()
      if (res.ok) {
        setUploadMsg(`✓ Imported ${d.count} invoice${d.count !== 1 ? 's' : ''}`)
        // Reload
        const fresh = await fetch('/api/invoices', { cache: 'no-store' }).then(r => r.json())
        setInvoices(fresh.invoices ?? [])
      } else {
        setUploadMsg(`Error: ${d.error}`)
      }
    } catch {
      setUploadMsg('Upload failed — try again')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const visible = isAdmin ? invoices : invoices.filter(inv =>
    me ? inv.contractor.toLowerCase().includes(me.username.toLowerCase()) : false
  )

  return (
    <div>
      <div className="flex items-center justify-between mt-6 mb-1">
        <div className="slbl mb-0">Braintrust Invoices</div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {uploadMsg && (
              <span className={`text-xs font-medium ${uploadMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>
                {uploadMsg}
              </span>
            )}
            <label className="btn-secondary cursor-pointer text-xs">
              {uploading ? 'Importing…' : '↑ Upload PDF'}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="alert alert-blue mb-4 text-xs">
          Showing your invoices only. Rates and amounts are private.
        </div>
      )}

      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 animate-pulse text-sm text-ink4">Loading invoices…</div>
          ) : visible.length === 0 ? (
            <div className="p-4 text-sm text-ink4">
              {isAdmin
                ? 'No invoices yet. Upload a Braintrust PDF export to get started.'
                : 'No invoices on file for your account yet.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-sand3">
                    <th className="text-left py-2 px-4 text-xs font-extrabold uppercase tracking-widest text-ink3">Contractor</th>
                    <th className="text-left py-2 px-3 text-xs font-extrabold uppercase tracking-widest text-ink3">Invoice</th>
                    <th className="text-left py-2 px-3 text-xs font-extrabold uppercase tracking-widest text-ink3">Period</th>
                    <th className="text-right py-2 px-3 text-xs font-extrabold uppercase tracking-widest text-ink3">Hours</th>
                    {isOwner && (
                      <th className="text-right py-2 px-3 text-xs font-extrabold uppercase tracking-widest text-ink3">Rate</th>
                    )}
                    {isAdmin && (
                      <th className="text-right py-2 px-3 text-xs font-extrabold uppercase tracking-widest text-ink3">Amount</th>
                    )}
                    <th className="text-center py-2 px-3 text-xs font-extrabold uppercase tracking-widest text-ink3">Status</th>
                    {isAdmin && <th className="py-2 px-3" />}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((inv) => (
                    <tr key={inv.id} className="border-b border-sand3 last:border-0 hover:bg-sand2/50 transition-colors">
                      <td className="py-2.5 px-4 font-bold">{inv.contractor}</td>
                      <td className="py-2.5 px-3 font-mono text-xs text-ink3">{inv.invoiceNumber || '—'}</td>
                      <td className="py-2.5 px-3 text-xs text-ink3">{inv.period || '—'}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-sm">{inv.hours > 0 ? inv.hours : '—'}</td>
                      {isOwner && (
                        <td className="py-2.5 px-3 text-right font-mono text-sm">
                          {inv.rate > 0 ? `$${inv.rate}/hr` : '—'}
                        </td>
                      )}
                      {isAdmin && (
                        <td className="py-2.5 px-3 text-right font-mono text-sm font-bold">
                          {inv.amount > 0 ? `$${inv.amount.toLocaleString()}` : '—'}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 uppercase ${STATUS_STYLE[inv.status] ?? STATUS_STYLE.unknown}`}>
                          {inv.status}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 px-3">
                          {inv.clickupUrl && (
                            <a href={inv.clickupUrl} target="_blank" rel="noopener noreferrer"
                               className="text-xs text-ink4 hover:text-ink underline">ClickUp ↗</a>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="text-xs text-ink4 mt-2">
          Amounts are visible to all admins. Rates are visible to Tony only.
        </div>
      )}
    </div>
  )
}
