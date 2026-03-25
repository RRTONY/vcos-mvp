'use client'

import { useState } from 'react'

export default function SignupPage() {
  const [form, setForm] = useState({ name: '', email: '', username_requested: '', role_requested: 'user', message: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setDone(true)
      } else {
        const d = await res.json()
        setError(d.error ?? 'Something went wrong')
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-sm mx-auto px-4 text-center">
        <div className="font-display text-3xl tracking-widest mb-1">RAMPRATE</div>
        <div className="text-sm text-ink3 uppercase tracking-widest mb-8">Visual Chief of Staff</div>
        <div className="card p-6">
          <div className="text-2xl mb-3">✅</div>
          <div className="font-semibold mb-2">Request submitted</div>
          <div className="text-sm text-ink3">Tony will review and send your credentials shortly.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto px-4">
      <div className="text-center mb-8">
        <div className="font-display text-3xl tracking-widest mb-1">RAMPRATE</div>
        <div className="text-sm text-ink3 uppercase tracking-widest">Request Access</div>
      </div>

      <form onSubmit={handleSubmit} className="card">
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-ink3 mb-1.5">Full Name</label>
            <input
              className="field-input w-full"
              placeholder="Your name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-ink3 mb-1.5">Email</label>
            <input
              type="email"
              className="field-input w-full"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-ink3 mb-1.5">Preferred Username</label>
            <input
              className="field-input w-full"
              placeholder="e.g. kim"
              value={form.username_requested}
              onChange={e => setForm({ ...form, username_requested: e.target.value })}
              autoCapitalize="none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-ink3 mb-1.5">Note (optional)</label>
            <textarea
              className="field-input w-full"
              rows={2}
              placeholder="Why you need access…"
              value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })}
            />
          </div>
          {error && <div className="alert alert-red text-sm">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Submitting…' : 'Request Access'}
          </button>
        </div>
      </form>

      <p className="text-center text-xs text-ink4 mt-4">
        Already have credentials? <a href="/login" className="underline">Sign in</a>
      </p>
    </div>
  )
}
