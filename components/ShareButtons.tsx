'use client'

import { useState } from 'react'
import { useToast } from './Toast'

interface ShareSlackProps {
  message: string
  label?: string
  channel?: string
}

export function ShareSlackButton({ message, label = 'Post to Slack', channel }: ShareSlackProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  async function handle() {
    setLoading(true)
    try {
      const res = await fetch('/api/share-slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, channel }),
      })
      const d = await res.json()
      if (d.success) toast('✓ Posted to #weeklyreports')
      else toast(`Slack error: ${d.error}`)
    } catch {
      toast('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="inline-flex items-center gap-1.5 border border-sand3 px-3 py-1.5 text-xs font-bold hover:bg-sand2 transition-colors disabled:opacity-50"
    >
      <SlackIcon />
      {loading ? 'Posting…' : label}
    </button>
  )
}

interface ShareClickUpProps {
  title: string
  description?: string
  priority?: 1 | 2 | 3 | 4
  label?: string
}

export function ShareClickUpButton({ title, description, priority = 3, label = 'Add to ClickUp' }: ShareClickUpProps) {
  const [loading, setLoading] = useState(false)
  const [taskUrl, setTaskUrl] = useState('')
  const { toast } = useToast()

  async function handle() {
    if (taskUrl) { window.open(taskUrl, '_blank'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/share-clickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, priority }),
      })
      const d = await res.json()
      if (d.success) {
        setTaskUrl(d.url)
        toast('✓ Task created in ClickUp')
        window.open(d.url, '_blank')
      } else {
        toast(`ClickUp error: ${d.error}`)
      }
    } catch {
      toast('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="inline-flex items-center gap-1.5 border border-sand3 px-3 py-1.5 text-xs font-bold hover:bg-sand2 transition-colors disabled:opacity-50"
    >
      <ClickUpIcon />
      {loading ? 'Creating…' : taskUrl ? 'Open in ClickUp ↗' : label}
    </button>
  )
}

export function ClickUpLink({ href, label = 'View in ClickUp' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 border border-sand3 px-3 py-1.5 text-xs font-bold hover:bg-sand2 transition-colors"
    >
      <ClickUpIcon />
      {label} ↗
    </a>
  )
}

function SlackIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  )
}

function ClickUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.667 14.868l2.862-2.192c1.486 1.942 3.025 2.85 4.647 2.85 1.616 0 3.132-.897 4.589-2.813l2.886 2.155C15.623 17.522 13.257 19.2 10.176 19.2c-3.087 0-5.478-1.695-7.509-4.332zM10.2 4.8L4.8 9.6l-2.133-2.4 7.533-6.8 7.467 6.8L15.6 9.6 10.2 4.8z"/>
    </svg>
  )
}
