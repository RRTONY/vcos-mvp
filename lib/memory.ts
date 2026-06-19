// Persistence layer for Tony — conversation memory, goals (source of truth), and
// the decision/commitment log. All three reuse the existing vcos_api_cache table
// (keyed by `source`), so there is NO new migration to run in Supabase.
import { getCached, setCache } from './api-cache'

// ── Conversation memory (per user) ──────────────────────────────────────────
// Messages auto-expire after 30 days. We prune lazily on every read/write (no
// cron needed): anything older than the window is dropped and never re-saved.
export interface StoredMsg { role: 'user' | 'assistant'; content: string; at: string }
const MAX_STORED = 80
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const chatKey = (username: string) => `chat:${username.toLowerCase()}`

function prune(msgs: StoredMsg[]): StoredMsg[] {
  const cutoff = Date.now() - RETENTION_MS
  return msgs.filter(m => {
    const t = m.at ? Date.parse(m.at) : NaN
    return Number.isNaN(t) ? true : t >= cutoff // keep undated (legacy) rows
  }).slice(-MAX_STORED)
}

export async function loadConversation(username: string): Promise<StoredMsg[]> {
  const row = await getCached(chatKey(username)).catch(() => null)
  const data = row?.data
  if (!Array.isArray(data)) return []
  const all = data as StoredMsg[]
  const kept = prune(all)
  // If pruning removed anything, persist the trimmed list so it's truly deleted.
  if (kept.length !== all.length) await setCache(chatKey(username), kept).catch(() => {})
  return kept
}

export async function saveConversation(username: string, msgs: StoredMsg[]): Promise<void> {
  await setCache(chatKey(username), prune(msgs)).catch(() => {})
}

export async function clearConversation(username: string): Promise<void> {
  await setCache(chatKey(username), []).catch(() => {})
}

// ── Goals — the quarterly "source of truth" every answer filters through ──────
const GOALS_KEY = 'tony:goals'
export async function loadGoals(): Promise<string> {
  const row = await getCached(GOALS_KEY).catch(() => null)
  const data = row?.data as { text?: string } | string | null
  if (typeof data === 'string') return data
  return data?.text ?? ''
}
export async function saveGoals(text: string): Promise<void> {
  await setCache(GOALS_KEY, { text })
}

// ── Decision & commitment log ─────────────────────────────────────────────────
export interface Commitment {
  id: string
  type: 'commitment' | 'decision'
  text: string
  owner: string | null
  due: string | null // YYYY-MM-DD
  status: 'open' | 'done'
  createdBy: string
  createdAt: string
}
const COMMITMENTS_KEY = 'tony:commitments'
const MAX_COMMITMENTS = 200

export async function loadCommitments(): Promise<Commitment[]> {
  const row = await getCached(COMMITMENTS_KEY).catch(() => null)
  const data = row?.data
  return Array.isArray(data) ? (data as Commitment[]) : []
}

async function saveCommitments(items: Commitment[]): Promise<void> {
  await setCache(COMMITMENTS_KEY, items.slice(-MAX_COMMITMENTS))
}

export interface NewCommitment { type?: string; text?: string; owner?: string | null; due?: string | null }

/** Append logged commitments/decisions (from chat) and return the full list. */
export async function addCommitments(news: NewCommitment[], createdBy: string): Promise<Commitment[]> {
  const valid = news.filter(n => n && typeof n.text === 'string' && n.text.trim())
  if (!valid.length) return loadCommitments()
  const existing = await loadCommitments()
  const now = new Date().toISOString()
  const dedupe = new Set(existing.map(c => c.text.trim().toLowerCase()))
  for (const n of valid) {
    const text = n.text!.trim()
    if (dedupe.has(text.toLowerCase())) continue
    dedupe.add(text.toLowerCase())
    existing.push({
      id: cryptoId(),
      type: n.type === 'decision' ? 'decision' : 'commitment',
      text,
      owner: n.owner?.trim() || null,
      due: /^\d{4}-\d{2}-\d{2}$/.test(n.due ?? '') ? n.due! : null,
      status: 'open',
      createdBy,
      createdAt: now,
    })
  }
  await saveCommitments(existing)
  return existing
}

export async function setCommitmentStatus(id: string, status: 'open' | 'done'): Promise<Commitment[]> {
  const items = await loadCommitments()
  const next = items.map(c => c.id === id ? { ...c, status } : c)
  await saveCommitments(next)
  return next
}

function cryptoId(): string {
  try { return globalThis.crypto?.randomUUID?.() ?? fallbackId() } catch { return fallbackId() }
}
function fallbackId(): string {
  return `c_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

// ── LOG protocol — Tony embeds machine-readable blocks in its reply when a
//    concrete commitment or decision is made; we extract + strip them. ─────────
const LOG_RE = /<<LOG>>([\s\S]*?)<<END>>/g

/** Pull NewCommitment objects out of an assistant reply. */
export function extractLogBlocks(text: string): NewCommitment[] {
  const out: NewCommitment[] = []
  for (const m of text.matchAll(LOG_RE)) {
    try {
      const obj = JSON.parse(m[1].trim())
      if (obj && typeof obj.text === 'string') out.push(obj)
    } catch { /* ignore malformed block */ }
  }
  return out
}

/** Remove LOG blocks so they never render in the UI. */
export function stripLogBlocks(text: string): string {
  return text.replace(LOG_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd()
}
