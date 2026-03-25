'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const from = searchParams.get('from') ?? '/'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        router.push(from)
        router.refresh()
      } else {
        const d = await res.json()
        setError(d.error ?? 'Invalid credentials')
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto px-4">
      <div className="text-center mb-8">
        <div className="font-display text-3xl tracking-widest mb-1">RAMPRATE</div>
        <div className="text-sm text-ink3 uppercase tracking-widest">Visual Chief of Staff</div>
      </div>

      <form onSubmit={handleSubmit} className="card">
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-ink3 mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field-input w-full"
              placeholder="your username"
              autoCapitalize="none"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-ink3 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input w-full"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <div className="alert alert-red text-sm">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </div>
      </form>

      <p className="text-center text-xs text-ink4 mt-4">
        Access restricted · RampRate / ImpactSoul
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-ink4 text-sm">Loading…</div>}>
      <LoginForm />
    </Suspense>
  )
}
