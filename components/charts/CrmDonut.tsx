'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  total: number
  overdue: number
  urgent: number
  completed: number
}

const COLORS = {
  onTrack:  '#4F46E5', // accent blue
  overdue:  '#DC2626', // danger red
  urgent:   '#D97706', // warning amber
  completed:'#16A34A', // success green
}

export default function CrmDonut({ total, overdue, urgent, completed }: Props) {
  const onTrack = Math.max(0, total - overdue - urgent - completed)

  const data = [
    { name: 'On Track',  value: onTrack,   color: COLORS.onTrack },
    { name: 'Overdue',   value: overdue,   color: COLORS.overdue },
    { name: 'Urgent',    value: urgent,    color: COLORS.urgent },
    { name: 'Done',      value: completed, color: COLORS.completed },
  ].filter((d) => d.value > 0)

  if (total === 0) return null

  return (
    <div className="flex items-center gap-6">
      {/* Donut */}
      <div className="relative flex-shrink-0" style={{ width: 130, height: 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={60}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => [`${v} tasks`]}
              contentStyle={{ fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 6 }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-ink tabular-nums">{total.toLocaleString()}</span>
          <span className="text-[10px] text-ink4 uppercase tracking-wide">Tasks</span>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="text-xs text-ink3 w-16">{d.name}</span>
            <span className="text-xs font-semibold tabular-nums text-ink">{d.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
