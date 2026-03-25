'use client'

import { useEffect, useState } from 'react'

interface ApiKey {
  key_name: string
  set: boolean
  masked_value: string
  last_updated: string | null
  updated_by: string | null
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/settings/keys')
      .then(r => r.json())
      .then(setKeys)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-ink4 text-sm pt-8">Loading…</div>

  return (
    <div className="pt-6 space-y-4">
      <h1 className="font-display text-xl tracking-widest">API Keys</h1>
      <p className="text-xs text-ink3">Key values are stored in Netlify environment variables. This page shows status only.</p>

      <div className="card divide-y divide-border">
        {keys.map(k => (
          <div key={k.key_name} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs font-semibold text-ink1">{k.key_name}</div>
              <div className="font-mono text-xs text-ink3 mt-0.5">{k.masked_value}</div>
            </div>
            <div className="shrink-0 text-right">
              <span className={`text-xs px-2 py-0.5 rounded ${k.set ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                {k.set ? '● Set' : '○ Missing'}
              </span>
              {k.last_updated && (
                <div className="text-xs text-ink4 mt-0.5">
                  updated {new Date(k.last_updated).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
