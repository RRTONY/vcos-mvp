'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface RefreshContextType {
  refreshKey: number
  lastUpdated: string
  nextRefresh: number | null
  freshClickUp: Record<string, unknown> | null
  triggerRefresh: (clickupData?: Record<string, unknown>) => void
  setNextRefresh: (ts: number | null) => void
}

const RefreshContext = createContext<RefreshContextType>({
  refreshKey: 0,
  lastUpdated: '',
  nextRefresh: null,
  freshClickUp: null,
  triggerRefresh: () => {},
  setNextRefresh: () => {},
})

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastUpdated, setLastUpdated] = useState('')
  const [nextRefresh, setNextRefresh] = useState<number | null>(null)
  const [freshClickUp, setFreshClickUp] = useState<Record<string, unknown> | null>(null)

  const triggerRefresh = useCallback((clickupData?: Record<string, unknown>) => {
    if (clickupData) setFreshClickUp(clickupData)
    setRefreshKey((k) => k + 1)
    setLastUpdated(new Date().toLocaleTimeString())
  }, [])

  return (
    <RefreshContext.Provider value={{ refreshKey, lastUpdated, nextRefresh, freshClickUp, triggerRefresh, setNextRefresh }}>
      {children}
    </RefreshContext.Provider>
  )
}

export function useRefresh() {
  return useContext(RefreshContext)
}
