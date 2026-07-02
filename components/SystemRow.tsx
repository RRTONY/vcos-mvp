'use client'

import { useState } from 'react'
import type { IconType } from 'react-icons'

type Status = 'green' | 'amber' | 'red'

interface SystemRowProps {
  icon: IconType
  name: string
  detail: string
  status: Status
  url?: string
  notes?: string[]
  manual?: boolean
  updatedBy?: string
  updatedAt?: string
  onSave?: (status: Status, detail: string) => Promise<void>
}

const statusConfig = {
  green: { dot: 'bg-black',      text: 'text-black',      label: 'Online' },
  amber: { dot: 'bg-amber-600',  text: 'text-amber-700',  label: 'Degraded' },
  red:   { dot: 'bg-red-600',    text: 'text-red-600',    label: 'Down' },
}

export default function SystemRow({ icon: Icon, name, detail, status, url, notes, manual, updatedBy, updatedAt, onSave }: SystemRowProps) {
  const [open, setOpen]       = useState(false)
  const [editing, setEditing] = useState(false)
  const [editStatus, setEditStatus] = useState<Status>(status)
  const [editDetail, setEditDetail] = useState(detail)
  const [saving, setSaving]   = useState(false)

  const cfg = statusConfig[status]

  async function handleSave() {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(editStatus, editDetail)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const updatedTime = updatedAt
    ? new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className="border-b border-sand3 last:border-0">
      <div className="flex items-center gap-3 py-3">
        <button
          onClick={() => { if (!editing) setOpen(v => !v) }}
          className="flex items-center gap-3 flex-1 text-left hover:bg-sand3/40 transition-colors px-1 -mx-1 rounded min-w-0"
        >
          <div className="w-8 flex items-center justify-center flex-shrink-0 text-ink3">
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">{name}</div>
            <div className="text-xs text-ink3 truncate">
              {detail}
              {manual && updatedBy && updatedTime && (
                <span className="text-ink4 ml-2">· updated by {updatedBy} {updatedTime}</span>
              )}
            </div>
          </div>
          <div className={`text-xs font-bold font-mono ${cfg.text} flex items-center gap-1.5 flex-shrink-0`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>
          <span className="text-ink4 text-xs ml-1">{open ? '▲' : '▼'}</span>
        </button>

        {onSave && !editing && (
          <button
            onClick={() => { setEditStatus(status); setEditDetail(detail); setEditing(true); setOpen(false) }}
            className="text-ink4 hover:text-ink text-xs px-1 flex-shrink-0"
            title="Edit status"
          >
            ✎
          </button>
        )}
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="px-11 pb-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={editStatus}
              onChange={e => setEditStatus(e.target.value as Status)}
              className="field-input text-xs py-1 w-32"
            >
              <option value="green">Online</option>
              <option value="amber">Degraded</option>
              <option value="red">Down</option>
            </select>
            <input
              value={editDetail}
              onChange={e => setEditDetail(e.target.value)}
              className="field-input text-xs py-1 flex-1 min-w-48"
              placeholder="Status detail…"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-xs py-1 px-3 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-ink4 hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Expanded notes */}
      {open && !editing && (
        <div className="px-11 pb-3 space-y-2">
          {notes && notes.length > 0 && (
            <ul className="space-y-1">
              {notes.map((n, i) => (
                <li key={i} className="text-xs text-ink2 flex gap-2">
                  <span className="text-ink4 flex-shrink-0">—</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs font-mono border border-black/30 px-2 py-0.5 hover:bg-black hover:text-white transition-colors mt-1"
              onClick={e => e.stopPropagation()}
            >
              Open {name} ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}
