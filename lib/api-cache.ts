import { supabase } from './supabase'
import { CACHE_TTL_SYSTEMS_MS } from './constants'

export const STALE_TTL_MS = 60 * 60 * 1000  // 1 hour — return stale data past this and warn
export const DEAD_TTL_MS  = 24 * 60 * 60 * 1000  // 24 hours — refuse to serve

export interface CacheRow {
  data: unknown
  fetched_at: string
  consecutive_failures: number
  last_error: string | null
  last_error_at: string | null
}

export interface CacheResult<T = unknown> {
  data: T | null
  stale: boolean
  ageMinutes: number
  circuitOpen: boolean
  error: string | null
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getCached(source: string): Promise<CacheRow | null> {
  const { data } = await supabase
    .from('vcos_api_cache')
    .select('data, fetched_at, consecutive_failures, last_error, last_error_at')
    .eq('source', source)
    .single()
  return data ?? null
}

/**
 * Stale-while-revalidate read.
 * Always returns data if it exists, but marks it stale/dead.
 * freshTtlMs — below this: fresh (no warning)
 * STALE_TTL_MS — between fresh and this: stale (show badge)
 * DEAD_TTL_MS  — beyond this: treat as no data
 */
export async function getCachedSWR<T = unknown>(
  source: string,
  freshTtlMs: number = CACHE_TTL_SYSTEMS_MS,
): Promise<CacheResult<T>> {
  const row = await getCached(source)

  if (!row) {
    return { data: null, stale: false, ageMinutes: 0, circuitOpen: false, error: 'No data cached yet. Click ↻ to load.' }
  }

  const ageMs = Date.now() - new Date(row.fetched_at).getTime()
  const ageMinutes = Math.round(ageMs / 60000)
  const circuitOpen = row.consecutive_failures >= 3

  if (ageMs > DEAD_TTL_MS) {
    return { data: null, stale: true, ageMinutes, circuitOpen, error: `Cache expired (${ageMinutes}m old). Click ↻ to refresh.` }
  }

  return {
    data: row.data as T,
    stale: ageMs > freshTtlMs,
    ageMinutes,
    circuitOpen,
    error: null,
  }
}

// ─── Write ───────────────────────────────────────────────────────────────────

export async function recordSuccess(source: string, payload: unknown) {
  await supabase.from('vcos_api_cache').upsert(
    {
      source,
      data: payload,
      fetched_at: new Date().toISOString(),
      consecutive_failures: 0,
      last_error: null,
      last_error_at: null,
    },
    { onConflict: 'source' }
  )
}

/** Legacy alias — same as recordSuccess */
export async function setCache(source: string, payload: unknown) {
  return recordSuccess(source, payload)
}

export async function recordFailure(source: string, error: string) {
  await supabase.rpc('increment_cache_failures', { p_source: source, p_error: error })
}

// ─── Circuit breaker ─────────────────────────────────────────────────────────

export async function isCircuitOpen(source: string): Promise<boolean> {
  const row = await getCached(source)
  return (row?.consecutive_failures ?? 0) >= 3
}
