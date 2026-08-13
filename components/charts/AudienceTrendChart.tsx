'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Props {
  data: { date: string; views: number; newUsers: number }[]
  color?: string
}

export default function AudienceTrendChart({ data, color = '#4F46E5' }: Props) {
  if (!data || data.length === 0) return null

  const points = data.map((d) => ({
    date: `${d.date.slice(4, 6)}/${d.date.slice(6, 8)}`,
    Views: d.views,
    'New users': d.newUsers,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={Math.ceil(points.length / 8)} />
        <YAxis tick={{ fontSize: 11 }} width={32} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 10px' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="Views" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="New users" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
