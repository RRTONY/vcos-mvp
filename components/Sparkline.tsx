'use client'

// Tiny dependency-free SVG sparkline for KPI trend tiles.
export default function Sparkline({
  values, color = '#4F46E5', width = 96, height = 24, fill = true,
}: { values: number[]; color?: string; width?: number; height?: number; fill?: boolean }) {
  const pts = values.filter(v => Number.isFinite(v))
  if (pts.length < 2) return null
  const max = Math.max(...pts), min = Math.min(...pts)
  const span = max - min || 1
  const stepX = width / (pts.length - 1)
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4)
  const coords = pts.map((v, i) => `${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`)
  const line = `M ${coords.join(' L ')}`
  const area = `${line} L ${width},${height} L 0,${height} Z`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden="true">
      {fill && <path d={area} fill={color} opacity={0.1} />}
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
