'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import type { WebWorkMember } from '@/lib/types'

interface Props {
  members: WebWorkMember[]
}

// Shorten first name for X axis
function firstName(username: string) {
  return username.charAt(0).toUpperCase() + username.slice(1).split(/[\s.]/)[0].slice(1)
}

// Color tiers: dark→medium→light based on rank
const BAR_COLORS = ['#4F46E5', '#818CF8', '#C7D2FE', '#E0E7FF']

export default function HoursBar({ members }: Props) {
  if (!members.length) return null

  const sorted = [...members].sort((a, b) => b.totalHours - a.totalHours)

  const data = sorted.map((m) => ({
    name: firstName(m.username),
    hours: m.totalHours,
  }))

  const maxHours = Math.max(...data.map((d) => d.hours), 1)
  const yMax = Math.ceil(maxHours / 5) * 5 + 5

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: '#6B7280' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, yMax]}
          tick={{ fontSize: 11, fill: '#6B7280' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}h`}
        />
        <Tooltip
          formatter={(v) => [`${v}h`]}
          contentStyle={{ fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 6 }}
          cursor={{ fill: '#F3F4F6' }}
        />
        <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
