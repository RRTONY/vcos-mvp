// Edge-compatible HMAC-SHA256 session auth
// Works in both Next.js middleware (Edge Runtime) and API routes (Node.js)

export const COOKIE_NAME = 'vcos_session'
const DAYS_30 = 30 * 24 * 60 * 60 * 1000

function getSecret(): string {
  return process.env.AUTH_SECRET ?? 'vcos-fallback-secret-change-me'
}

// Parse AUTH_USERS env var: "tony:pass:admin,kim:pass:user"
export function getUsers(): Record<string, { password: string; role: string }> {
  const raw = process.env.AUTH_USERS ?? 'ramprate:vcos2026:admin,tony:vcos2026:admin'
  const users: Record<string, { password: string; role: string }> = {}
  for (const entry of raw.split(',')) {
    const parts = entry.trim().split(':')
    if (parts.length >= 2) {
      const [username, password, role = 'user'] = parts
      users[username.toLowerCase()] = { password, role }
    }
  }
  return users
}

// Legacy plaintext check (AUTH_USERS fallback only)
export function validateCredentials(username: string, password: string): string | null {
  const users = getUsers()
  const user = users[username.toLowerCase()]
  if (!user) return null
  if (user.password !== password) return null
  return user.role
}

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function toBase64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64url(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

export async function createSession(username: string, role: string): Promise<string> {
  const payload = toBase64url(
    new TextEncoder().encode(JSON.stringify({ u: username, r: role, e: Date.now() + DAYS_30 })).buffer as ArrayBuffer
  )
  const key = await getKey(getSecret())
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload).buffer as ArrayBuffer)
  return `${payload}.${toBase64url(sig)}`
}

export async function verifySession(token: string): Promise<{ username: string; role: string } | null> {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const payload = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const key = await getKey(getSecret())
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      fromBase64url(sig),
      new TextEncoder().encode(payload).buffer as ArrayBuffer
    )
    if (!valid) return null
    const { u, r, e } = JSON.parse(new TextDecoder().decode(fromBase64url(payload)))
    if (Date.now() > e) return null
    return { username: u, role: r }
  } catch {
    return null
  }
}
