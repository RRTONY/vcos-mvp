// One-time seed script — run with: node scripts/seed-users.mjs
// Reads SUPABASE_URL + SUPABASE_SERVICE_KEY from .env and seeds all users

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'fs'

// Parse .env manually (no dotenv needed)
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
)

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)

const USERS = [
  { username: 'tony',     password: 'vcos2026', role: 'admin' },
  { username: 'ramprate', password: 'vcos2026', role: 'admin' },
  { username: 'kim',      password: 'vcos2026', role: 'admin' },
  { username: 'chase',    password: 'vcos2026', role: 'admin' },
  { username: 'rob',      password: 'vcos2026', role: 'user' },
  { username: 'alex',     password: 'vcos2026', role: 'user' },
  { username: 'josh',     password: 'vcos2026', role: 'user' },
  { username: 'daniel',   password: 'vcos2026', role: 'user' },
  { username: 'ben',      password: 'vcos2026', role: 'user' },
]

for (const u of USERS) {
  const { data: existing } = await supabase
    .from('vcos_users').select('id').eq('username', u.username).single()

  if (existing) {
    console.log(`⏭  ${u.username} — already exists`)
    continue
  }

  const password_hash = await bcrypt.hash(u.password, 10)
  const { error } = await supabase.from('vcos_users').insert({
    username: u.username, role: u.role, password_hash,
    status: 'active', approved_by: 'seed-script',
  })

  console.log(error ? `❌ ${u.username} — ${error.message}` : `✅ ${u.username} (${u.role})`)
}

console.log('\nDone.')
