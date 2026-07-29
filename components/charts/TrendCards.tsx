'use client'

import type { WebWorkMember } from '@/lib/types'

interface Props {
  members: WebWorkMember[]
  lastWeekLabel: string
}

function avatar(username: string, index: number) {
  const colors = ['#4F46E5', '#7C3AED', '#0891B2', '#059669', '#D97706', '#DC2626', '#6B7280']
  return { letter: username[0].toUpperCase(), bg: colors[index % colors.length] }
}

function TrendCard({ member, index }: { member: WebWorkMember; index: number }) {
  const { letter, bg } = avatar(member.username, index)
  const thisWeek = member.totalHours
  const lastWeek = member.lastWeekHours ?? 0
  const diff = thisWeek - lastWeek
  const pct = lastWeek > 0 ? Math.round((diff / lastWeek) * 100) : null
  const up = diff > 0
  const same = diff === 0

  return (
    <div className="card px-4 py-4 flex items-center gap-3">
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
        style={{ background: bg }}
      >
        {letter}
      </div>

      {/* Name + hours */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold capitalize truncate">{member.username}</div>
        <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
          <span className="text-lg font-bold tabular-nums text-ink">{thisWeek}h</span>
          {lastWeek > 0 && (
            <span className="text-xs text-ink4 tabular-nums">vs {lastWeek}h</span>
          )}
        </div>
      </div>

      {/* Trend badge */}
      <div className="flex-shrink-0 text-right">
        {pct !== null ? (
          <div className={`flex items-center gap-1 text-sm font-semibold tabular-nums ${
            same ? 'text-ink4' : up ? 'text-success' : 'text-danger'
          }`}>
            <span>{same ? '—' : up ? '▲' : '▼'}</span>
            <span>{same ? '0%' : `${Math.abs(pct)}%`}</span>
          </div>
        ) : (
          <span className="text-xs text-ink4">no prior data</span>
        )}
        <div className="text-[10px] text-ink4 mt-0.5">vs last week</div>
      </div>
    </div>
  )
}

export default function TrendCards({ members, lastWeekLabel }: Props) {
  const sorted = [...members].sort((a, b) => b.totalHours - a.totalHours)

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <span className="text-xs text-ink4">vs week of {lastWeekLabel}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sorted.map((m, i) => (
          <TrendCard key={m.username} member={m} index={i} />
        ))}
      </div>
    </div>
  )
}
