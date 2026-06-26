'use client'

import { useCallback, useEffect, useState } from 'react'
import Spinner from '@/components/Spinner'
import { FiRefreshCw } from 'react-icons/fi'
import type { SlackMessage } from '@/lib/slack'

export default function SlackFeedPage() {
  const [messages, setMessages] = useState<SlackMessage[]>([])
  const [byChannel, setByChannel] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [channel, setChannel] = useState<string>('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/slack-messages', { cache: 'no-store' }).then(r => r.json()).then(d => {
      setMessages(Array.isArray(d.messages) ? d.messages : [])
      setByChannel(d.byChannel ?? {})
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const refresh = async () => {
    setRefreshing(true)
    await fetch('/api/slack-messages', { method: 'POST' }).catch(() => {})
    setRefreshing(false)
    load()
  }

  const channels = Object.keys(byChannel).sort((a, b) => byChannel[b] - byChannel[a])
  const shown = channel ? messages.filter(m => m.channel === channel) : messages

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-xl tracking-widest">SLACK FEED</h1>
        <button onClick={refresh} disabled={refreshing} className="btn-secondary flex items-center gap-1.5 !py-1.5 disabled:opacity-50">
          <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Pulling…' : 'Refresh'}
        </button>
      </div>
      <p className="text-xs text-ink4 mb-4">Recent messages from channels VCoS-AI can read — also fed into the assistant so it knows what&apos;s happening in Slack.</p>

      {!loading && channels.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
          <button onClick={() => setChannel('')} className={`text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap ${!channel ? 'bg-accent text-white border-accent' : 'border-sand4 text-ink3 hover:border-accent'}`}>All ({messages.length})</button>
          {channels.map(c => (
            <button key={c} onClick={() => setChannel(c)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap ${channel === c ? 'bg-accent text-white border-accent' : 'border-sand4 text-ink3 hover:border-accent'}`}>#{c} ({byChannel[c]})</button>
          ))}
        </div>
      )}

      {loading ? <div className="py-6"><Spinner label="Loading Slack feed…" className="text-ink4 text-sm" /></div>
        : messages.length === 0 ? <div className="card p-6 text-center text-sm text-ink4">No messages ingested yet. Click Refresh (the bot must be a member of the channels). </div>
        : (
          <div className="card divide-y divide-sand3">
            {shown.map((m, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-ink4 mb-0.5">
                  <span className="badge !py-0">#{m.channel}</span>
                  <span className="font-semibold text-ink3">{m.user}</span>
                  <span>· {new Date(m.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                <div className="text-sm text-ink2 whitespace-pre-wrap break-words">{m.text}</div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
