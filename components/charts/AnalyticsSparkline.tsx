'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Props {
  data: { date: string; sessions: number }[]
  color?: string
}

export default function AnalyticsSparkline({ data, color = '#4F46E5' }: Props) {
  if (!data || data.length === 0) return null

  const points = data.map((d) => ({
    date: `${d.date.slice(4, 6)}/${d.date.slice(6, 8)}`, // "YYYYMMDD" -> "MM/DD"
    sessions: d.sessions,
  }))

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={32} allowDecimals={false} />
        <Line
          type="monotone"
          dataKey="sessions"
          name="Sessions"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3 }}
          isAnimationActive={false}
        />
        <Tooltip
          formatter={(v) => [`${v} sessions`]}
          labelFormatter={(l) => l}
          contentStyle={{ fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 10px' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
