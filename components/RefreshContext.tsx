'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

interface RefreshContextType {
  refreshKey: number
  lastUpdated: string
  nextRefresh: number | null
  freshClickUp: Record<string, unknown> | null
  liveClickUp: Record<string, unknown> | null
  triggerRefresh: (clickupData?: Record<string, unknown>) => void
  setNextRefresh: (ts: number | null) => void
}

const RefreshContext = createContext<RefreshContextType>({
  refreshKey: 0,
  lastUpdated: '',
  nextRefresh: null,
  freshClickUp: null,
  liveClickUp: null,
  triggerRefresh: () => {},
  setNextRefresh: () => {},
})

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastUpdated, setLastUpdated] = useState('')
  const [nextRefresh, setNextRefresh] = useState<number | null>(null)
  const [freshClickUp, setFreshClickUp] = useState<Record<string, unknown> | null>(null)

  // Live ClickUp: the ClickUp webhook patches the cache within seconds of a
  // change, so poll the cache's timestamp (cheap) and fetch fresh data for
  // pages only when it has moved. Skipped while the tab is hidden.
  const [liveClickUp, setLiveClickUp] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    let last: string | null = null
    let stopped = false
    const tick = async () => {
      if (document.hidden) return
      try {
        const res = await fetch('/api/clickup-tasks?version=1', { cache: 'no-store' })
        const { fetchedAt } = await res.json()
        if (!fetchedAt || fetchedAt === last) return
        const first = last === null
        last = fetchedAt
        if (first) return
        const data = await fetch('/api/clickup-tasks', { cache: 'no-store' }).then((r) => r.json())
        if (!stopped) setLiveClickUp(data)
      } catch {
        /* signed out or offline - try again next tick */
      }
    }
    tick()
    const id = setInterval(tick, 20_000)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [])

  const triggerRefresh = useCallback((clickupData?: Record<string, unknown>) => {
    if (clickupData) setFreshClickUp(clickupData)
    setRefreshKey((k) => k + 1)
    setLastUpdated(new Date().toLocaleTimeString())
  }, [])

  return (
    <RefreshContext.Provider value={{ refreshKey, lastUpdated, nextRefresh, freshClickUp, liveClickUp, triggerRefresh, setNextRefresh }}>
      {children}
    </RefreshContext.Provider>
  )
}

export function useRefresh() {
  return useContext(RefreshContext)
}
