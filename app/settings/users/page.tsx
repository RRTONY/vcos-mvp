'use client'

import { useEffect, useState } from 'react'

interface User {
  id: string
  username: string
  email: string | null
  role: string
  status: string
  approved_by: string | null
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', email: '', role: 'user' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/settings/users')
    if (res.ok) setUsers(await res.json())
    else setError('Failed to load users')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/settings/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    })
    const d = await res.json()
    if (res.ok) {
      setMsg(`✅ Created. Temp password: ${d.tempPassword}`)
      setShowAdd(false)
      setNewUser({ username: '', email: '', role: 'user' })
      load()
    } else {
      setMsg(`❌ ${d.error}`)
    }
    setSaving(false)
  }

  async function toggleStatus(user: User) {
    const status = user.status === 'active' ? 'inactive' : 'active'
    await fetch(`/api/settings/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  async function resetPassword(user: User) {
    const res = await fetch(`/api/settings/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetPassword: true }),
    })
    const d = await res.json()
    if (res.ok) setMsg(`🔑 New password for ${user.username}: ${d.tempPassword}`)
  }

  async function changeRole(user: User, role: string) {
    await fetch(`/api/settings/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    load()
  }

  async function runBootstrap() {
    setSaving(true)
    const res = await fetch('/api/auth/bootstrap', { method: 'POST' })
    const d = await res.json()
    const summary = d.results?.map((r: { username: string; status: string }) => `${r.username}: ${r.status}`).join(', ')
    setMsg(`Bootstrap: ${summary}`)
    load()
    setSaving(false)
  }

  if (loading) return <div className="text-ink4 text-sm pt-8">Loading users…</div>
  if (error) return <div className="alert alert-red mt-8">{error}</div>

  return (
    <div className="pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl tracking-widest">User Management</h1>
        <div className="flex gap-2">
          <button onClick={runBootstrap} disabled={saving} className="btn-secondary text-xs">
            Seed from ENV
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-xs">
            + Add User
          </button>
        </div>
      </div>

      {msg && (
        <div className="card p-3 text-sm font-mono break-all">{msg}</div>
      )}

      {showAdd && (
        <form onSubmit={addUser} className="card p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest text-ink3">New User</div>
          <div className="grid grid-cols-3 gap-3">
            <input
              className="field-input"
              placeholder="username"
              value={newUser.username}
              onChange={e => setNewUser({ ...newUser, username: e.target.value })}
              required
            />
            <input
              className="field-input"
              placeholder="email (optional)"
              type="email"
              value={newUser.email}
              onChange={e => setNewUser({ ...newUser, email: e.target.value })}
            />
            <select
              className="field-input"
              value={newUser.role}
              onChange={e => setNewUser({ ...newUser, role: e.target.value })}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary text-xs">Create</button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary text-xs">Cancel</button>
          </div>
        </form>
      )}

      <div className="card divide-y divide-border">
        {users.map(user => (
          <div key={user.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">{user.username}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${user.role === 'owner' ? 'bg-black text-white' : user.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                  {user.role}
                </span>
                {user.status === 'inactive' && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600">inactive</span>
                )}
              </div>
              {user.email && <div className="text-xs text-ink3 mt-0.5">{user.email}</div>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => resetPassword(user)}
                className="text-xs text-ink3 hover:text-ink1 underline"
              >
                Reset PW
              </button>
              <select
                value={user.role}
                onChange={e => changeRole(user, e.target.value)}
                className="text-xs border border-border rounded px-1 py-0.5 bg-canvas"
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
              <button
                onClick={() => toggleStatus(user)}
                className={`text-xs underline ${user.status === 'active' ? 'text-red-500' : 'text-green-600'}`}
              >
                {user.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div className="px-4 py-6 text-center text-ink4 text-sm">
            No users yet — click "Seed from ENV" to import existing logins, or "Add User" to create one.
          </div>
        )}
      </div>
    </div>
  )
}
