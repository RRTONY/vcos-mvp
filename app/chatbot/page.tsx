'use client'

import { useEffect, useState, useCallback } from 'react'
import { List, useDynamicRowHeight, useListRef, type RowComponentProps } from 'react-window'
import { useMe } from '@/hooks/useMe'
import { FiSend, FiDownload, FiFileText, FiFile, FiTrash2, FiTarget, FiCheckSquare, FiX, FiSquare } from 'react-icons/fi'
import { exportReport, detectFormat, deriveTitle, type ExportFormat } from '@/lib/export-doc'
import Markdown from '@/components/Markdown'
import { REPORT_TEMPLATES as SUGGESTIONS } from '@/lib/report-templates'

interface Msg { id: string; role: 'user' | 'assistant'; content: string }
interface Commitment { id: string; type: 'commitment' | 'decision'; text: string; owner: string | null; due: string | null; status: 'open' | 'done'; createdAt: string }

let _id = 0
const newId = () => `m${++_id}`

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'You'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Hide the machine-readable LOG blocks VCoS-AI embeds (even partial ones mid-stream).
function stripLog(s: string): string {
  return s.replace(/<<LOG>>[\s\S]*?<<END>>/g, '').replace(/<<LOG>>[\s\S]*$/, '').replace(/\n{3,}/g, '\n\n')
}

function DownloadMenu({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const go = (fmt: ExportFormat) => { exportReport(text, fmt, deriveTitle(text)); setOpen(false) }
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-ink3 hover:text-accent transition-colors mt-2">
        <FiDownload size={13} /> Download
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1 z-20 bg-sand border border-sand4 rounded-lg shadow-card-md py-1 w-36">
            <button onClick={() => go('pdf')} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-sand3 text-left"><FiFileText size={14} className="text-danger" /> PDF</button>
            <button onClick={() => go('doc')} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-sand3 text-left"><FiFile size={14} className="text-accent" /> Word (.doc)</button>
          </div>
        </>
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1">
      <span className="w-1.5 h-1.5 bg-ink4 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 bg-ink4 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 bg-ink4 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  )
}

// One virtualized chat row. Height is measured automatically by react-window's
// useDynamicRowHeight, so bubbles can be any size — we just let content flow.
function MessageRow({ index, style, messages, userName }: RowComponentProps<{ messages: Msg[]; userName: string }>) {
  const m = messages[index]
  return (
    <div style={{ ...style, height: 'auto' }}>
      <div className="px-1 sm:px-3 py-3">
        {m.role === 'user' ? (
          <div className="flex gap-3 justify-end">
            <div className="flex flex-col items-end max-w-[85%]">
              <span className="text-[11px] font-semibold text-ink4 mb-1 mr-1">{userName}</span>
              <div className="bg-accent text-white rounded-2xl rounded-tr-sm px-5 py-3 text-sm whitespace-pre-wrap">{m.content}</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-accent-light text-accent flex items-center justify-center flex-shrink-0 text-xs font-bold" title={userName}>{initialsOf(userName)}</div>
          </div>
        ) : (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-ink text-white flex items-center justify-center flex-shrink-0 font-display text-xs">AI</div>
            <div className="max-w-[88%]">
              <div className="bg-sand2 border border-sand3 rounded-2xl rounded-tl-sm px-5 py-4">
                {m.content ? <Markdown text={m.content} /> : <TypingDots />}
              </div>
              {m.content && !m.content.startsWith('⚠️') && <DownloadMenu text={m.content} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div className="bg-sand rounded-lg shadow-card-md border border-sand4 w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-sand3">
          <h2 className="card-ti">{title}</h2>
          <button onClick={onClose} className="text-ink4 hover:text-ink"><FiX size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function GoalsModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { fetch('/api/goals').then(r => r.json()).then(d => { setText(d.text ?? ''); setLoading(false) }).catch(() => setLoading(false)) }, [])
  const save = async () => {
    setSaving(true); setSaved(false)
    await fetch('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => {})
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  return (
    <Modal title="Goals — Tony's source of truth" onClose={onClose}>
      <p className="text-xs text-ink4 mb-3">Quarterly objectives, ranked. Tony filters every recommendation against these and flags when work drifts.</p>
      {loading ? <div className="text-sm text-ink4">Loading…</div> : (
        <>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={12} className="field-input resize-none font-mono text-[13px]"
            placeholder={'Q3 2026 objectives (most important first):\n1. Close FreshCredit — 17.5% commission\n2. Abakus $75M raise to first close\n3. ...'} />
          <div className="flex items-center gap-3 mt-3">
            <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Saving…' : 'Save goals'}</button>
            {saved && <span className="text-sm text-success font-semibold">✓ Saved</span>}
          </div>
        </>
      )}
    </Modal>
  )
}

function CommitmentsModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Commitment[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => { fetch('/api/commitments').then(r => r.json()).then(d => { setItems(d.items ?? []); setLoading(false) }).catch(() => setLoading(false)) }, [])
  useEffect(() => { load() }, [load])
  const toggle = async (c: Commitment) => {
    const status = c.status === 'open' ? 'done' : 'open'
    const r = await fetch('/api/commitments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, status }) }).then(r => r.json()).catch(() => null)
    if (r?.items) setItems(r.items)
  }
  const today = new Date().toISOString().slice(0, 10)
  const open = items.filter(c => c.status === 'open')
  const done = items.filter(c => c.status === 'done')
  return (
    <Modal title="Decision & Commitment Log" onClose={onClose}>
      <p className="text-xs text-ink4 mb-3">Tony logs commitments and decisions from your chats automatically. Check one off when it&apos;s handled.</p>
      {loading ? <div className="text-sm text-ink4">Loading…</div> : items.length === 0 ? (
        <div className="text-sm text-ink4">Nothing logged yet. Make a commitment in chat (e.g. &ldquo;I&apos;ll send the deck by Friday&rdquo;) and Tony will track it.</div>
      ) : (
        <div className="space-y-4">
          {open.length > 0 && (
            <div>
              <div className="slbl !mt-0 !mb-2">Open ({open.length})</div>
              <div className="space-y-1.5">
                {open.map(c => {
                  const overdue = c.due && c.due < today
                  return (
                    <button key={c.id} onClick={() => toggle(c)} className="flex items-start gap-2.5 w-full text-left p-2 rounded hover:bg-sand2">
                      <FiSquare size={16} className="text-ink4 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{c.text}</div>
                        <div className="text-[11px] text-ink4 mt-0.5 flex gap-2 flex-wrap">
                          <span className="badge !py-0">{c.type}</span>
                          {c.owner && <span>· {c.owner}</span>}
                          {c.due && <span className={overdue ? 'text-danger font-semibold' : ''}>· due {c.due}{overdue ? ' ⚠️' : ''}</span>}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <div className="slbl !mt-0 !mb-2">Done ({done.length})</div>
              <div className="space-y-1.5">
                {done.map(c => (
                  <button key={c.id} onClick={() => toggle(c)} className="flex items-start gap-2.5 w-full text-left p-2 rounded hover:bg-sand2 opacity-60">
                    <FiCheckSquare size={16} className="text-success mt-0.5 flex-shrink-0" />
                    <div className="text-sm line-through">{c.text}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function ChatbotPage() {
  const { me, isAdmin } = useMe()
  // Everyone can create & download reports from their OWN data; team-wide
  // reports (the `admin` templates) are offered only to admins.
  const userName = me?.fullName || me?.username || 'You'
  const firstName = userName.split(' ')[0]
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showGoals, setShowGoals] = useState(false)
  const [showCommit, setShowCommit] = useState(false)
  const listRef = useListRef(null)
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 88 })

  // Load persisted conversation memory on open.
  useEffect(() => {
    fetch('/api/chat/history').then(r => r.json()).then(d => {
      const stored = Array.isArray(d.messages) ? d.messages : []
      setMessages(stored.map((m: { role: 'user' | 'assistant'; content: string }) => ({ id: newId(), role: m.role, content: m.content })))
    }).catch(() => {})
  }, [])

  // Keep the latest message pinned to the bottom (incl. while it streams).
  useEffect(() => {
    if (messages.length) listRef.current?.scrollToRow({ index: messages.length - 1, align: 'end' })
  }, [messages, listRef])

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy) return
    const userMsg: Msg = { id: newId(), role: 'user', content }
    const asstId = newId()
    const history = [...messages, userMsg]
    setMessages([...history, { id: asstId, role: 'assistant', content: '' }])
    setInput(''); setBusy(true)
    const wantFormat = detectFormat(content) // auto-download if the user named a format

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Request failed (${res.status})`)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += dec.decode(value, { stream: true })
        setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: stripLog(acc) } : m))
      }
      const clean = stripLog(acc)
      if (wantFormat && clean.trim()) {
        try { exportReport(clean, wantFormat, deriveTitle(clean)) } catch { /* ignore export errors */ }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.'
      setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: `⚠️ ${msg}` } : m))
    } finally {
      setBusy(false)
    }
  }

  const clearChat = async () => {
    if (busy) return
    setMessages([])
    await fetch('/api/chat/history', { method: 'DELETE' }).catch(() => {})
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  return (
    <div className="flex flex-col px-2 sm:px-5 lg:px-10" style={{ height: 'calc(100vh - 9rem)' }}>
      <div className="flex items-center justify-between mt-6 mb-3 gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl tracking-widest">VCoS-AI</h1>
          <p className="text-xs text-ink4 mt-0.5">Your Virtual Chief of Staff — remembers your chats, grounded in live data{isAdmin ? '' : ' (your own data)'}. Create &amp; download reports as PDF or Word{isAdmin ? '' : '; team-wide reports are admin-only'}.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && <button onClick={() => setShowGoals(true)} className="btn-secondary flex items-center gap-1.5 !py-1.5"><FiTarget size={14} /> <span className="hidden sm:inline">Goals</span></button>}
          {isAdmin && <button onClick={() => setShowCommit(true)} className="btn-secondary flex items-center gap-1.5 !py-1.5"><FiCheckSquare size={14} /> <span className="hidden sm:inline">Log</span></button>}
          {messages.length > 0 && <button onClick={clearChat} className="btn-secondary flex items-center gap-1.5 !py-1.5" title="Clear conversation"><FiTrash2 size={14} /> <span className="hidden sm:inline">Clear</span></button>}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 card mb-3 overflow-hidden flex flex-col min-h-0">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4">
            <div className="w-12 h-12 rounded-full bg-ink text-white flex items-center justify-center font-display text-lg mb-3">AI</div>
            <p className="text-sm text-ink3 max-w-md mb-5">{firstName !== 'You' ? `Hi ${firstName} — ` : ''}I&apos;m VCoS-AI, your Virtual Chief of Staff. I triage, draft, track, and flag — grounded in the current week&apos;s reports and ClickUp tasks, and I remember our past conversations. Ask me anything, find info, or generate a report. Tell me a format (“as PDF” / “as Word”) and I’ll prep a download.</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTIONS.filter(s => isAdmin || !s.admin).map(s => (
                <button key={s.label} onClick={() => send(s.prompt)} className="badge-accent hover:bg-accent hover:text-white transition-colors px-3 py-1.5">{s.label}</button>
              ))}
            </div>
          </div>
        ) : (
          <List
            listRef={listRef}
            rowComponent={MessageRow}
            rowCount={messages.length}
            rowHeight={rowHeight}
            rowProps={{ messages, userName }}
            defaultHeight={400}
            className="px-3 sm:px-6 py-5"
            style={{ height: '100%' }}
          />
        )}
      </div>

      {/* Quick suggestions — always available so common asks are one click */}
      <div className="flex gap-2 overflow-x-auto pb-2 px-0.5 scrollbar-thin">
        <span className="text-[11px] font-semibold text-ink4 self-center flex-shrink-0 pr-0.5">Try:</span>
        {SUGGESTIONS.filter(s => isAdmin || !s.admin).map(s => (
          <button key={s.label} onClick={() => send(s.prompt)} disabled={busy}
            className="badge whitespace-nowrap hover:border-accent hover:text-accent transition-colors disabled:opacity-40 flex-shrink-0">
            {s.label}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Ask VCoS-AI…  (Shift+Enter for a new line)"
          className="field-input flex-1 resize-none max-h-32"
          disabled={busy}
        />
        <button onClick={() => send(input)} disabled={busy || !input.trim()} className="btn-primary flex items-center gap-2 h-[46px] disabled:opacity-40">
          <FiSend size={15} /> <span className="hidden sm:inline">Send</span>
        </button>
      </div>

      {showGoals && <GoalsModal onClose={() => setShowGoals(false)} />}
      {showCommit && <CommitmentsModal onClose={() => setShowCommit(false)} />}
    </div>
  )
}
