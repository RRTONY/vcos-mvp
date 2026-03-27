'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import LivePill from './LivePill'
import { useRefresh } from './RefreshContext'
import { useMe } from '@/hooks/useMe'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Topbar() {
  const { me } = useMe()
  const [clock, setClock] = useState('--:--:--')
  const [dateStr, setDateStr] = useState('')
  const { lastUpdated, triggerRefresh } = useRefresh()
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  // Clock
  useEffect(() => {
    function tick() {
      const n = new Date()
      setClock(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`)
      setDateStr(`${DAYS[n.getDay()]} ${MONTHS[n.getMonth()]} ${n.getDate()}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }, [router])

  return (
    <div className="bg-ink text-sand h-14 flex items-center justify-between px-4 sticky top-0 z-40 border-b border-white/10">
      {/* Brand */}
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <span className="font-display text-lg tracking-widest whitespace-nowrap">RAMPRATE</span>
        <span className="text-white/30 hidden sm:block">·</span>
        <span className="text-sm font-medium opacity-60 truncate hidden sm:block">Visual Chief of Staff</span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        <span className="text-white/50 font-mono text-xs hidden md:block">{dateStr}</span>
        <span className="font-mono text-sm tabular-nums">{clock}</span>
        {lastUpdated && (
          <span className="text-white/40 text-xs hidden lg:block">· {lastUpdated}</span>
        )}
        <button
          onClick={async () => {
            setRefreshing(true)
            await Promise.allSettled([
              fetch('/api/clickup-tasks',    { method: 'POST' }),
              fetch('/api/slack-stats',      { method: 'POST' }),
              fetch('/api/webwork',          { method: 'POST' }),
              fetch('/api/fireflies-meetings', { method: 'POST' }),
            ])
            triggerRefresh()
            setRefreshing(false)
          }}
          disabled={refreshing}
          className="border border-white/20 px-2 py-0.5 font-mono text-xs hover:bg-white/10 transition-colors disabled:opacity-40"
          title="Refresh all data sources"
        >
          {refreshing ? '…' : '↻'}
        </button>
        <LivePill />
        {me && (
          <div className="flex items-center gap-1.5 ml-1">
            <span className="text-white/50 text-xs hidden sm:block">
              {me.username}
              {me.role === 'owner' && <span className="ml-1 text-white/30">·owner</span>}
              {me.role === 'admin' && <span className="ml-1 text-white/30">·admin</span>}
            </span>
            <button
              onClick={handleLogout}
              className="border border-white/20 px-2 py-0.5 font-mono text-xs hover:bg-white/10 transition-colors"
              title="Sign out"
            >
              ⏻
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
