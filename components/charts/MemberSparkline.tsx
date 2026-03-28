'use client'

import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  byDay: { date: string; hours: number }[]
  color?: string
}

export default function MemberSparkline({ byDay, color = '#4F46E5' }: Props) {
  if (!byDay || byDay.length === 0) return null

  const data = byDay.map((d) => ({
    date: d.date.slice(5), // "MM-DD"
    hours: d.hours,
  }))

  return (
    <ResponsiveContainer width={72} height={28}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="hours"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          formatter={(v) => [`${v}h`]}
          labelFormatter={(l) => l}
          contentStyle={{ fontSize: 11, border: '1px solid #E5E7EB', borderRadius: 4, padding: '2px 6px' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
