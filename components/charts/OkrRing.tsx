'use client'

import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts'

interface OKR {
  id: string
  label: string
  pct: number
  note: string
}

interface Props {
  okrs: OKR[]
}

function ringColor(pct: number) {
  if (pct >= 80) return '#16A34A'  // success green
  if (pct >= 40) return '#4F46E5'  // accent blue
  if (pct >= 20) return '#D97706'  // warning amber
  return '#DC2626'                 // danger red
}

function OkrRingItem({ okr }: { okr: OKR }) {
  const color = ringColor(okr.pct)
  const data = [{ value: Math.max(okr.pct, 1) }]

  return (
    <div className="flex flex-col items-center min-w-0">
      <div className="relative" style={{ width: 88, height: 88 }}>
        {/* Background track */}
        <svg className="absolute inset-0" width="88" height="88">
          <circle cx="44" cy="44" r="36" fill="none" stroke="#F3F4F6" strokeWidth="8" />
        </svg>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius={32}
            outerRadius={44}
            startAngle={90}
            endAngle={-270}
            data={data}
            barSize={8}
          >
            <RadialBar
              dataKey="value"
              cornerRadius={4}
              fill={color}
              background={false}
              max={100}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        {/* Center % */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-bold tabular-nums" style={{ color }}>{okr.pct}%</span>
        </div>
      </div>
      <div className="mt-2 text-center w-full">
        <div className="text-xs font-semibold text-ink leading-tight break-words">{okr.label}</div>
        <div className="text-[10px] text-ink4 mt-0.5 truncate" title={okr.note}>{okr.note}</div>
      </div>
    </div>
  )
}

export default function OkrRings({ okrs }: Props) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-2 gap-y-4 py-4">
      {okrs.map((o) => (
        <OkrRingItem key={o.id} okr={o} />
      ))}
    </div>
  )
}
