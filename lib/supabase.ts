import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
    _client = createClient(url, key)
  }
  return _client
}

// Convenience alias
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export interface VcosUser {
  id: string
  username: string
  email: string | null
  password_hash: string
  role: string
  status: string
  approved_by: string | null
  created_at: string
}

export interface SignupRequest {
  id: string
  name: string
  email: string | null
  username_requested: string | null
  role_requested: string | null
  message: string | null
  status: string
  created_at: string
}
