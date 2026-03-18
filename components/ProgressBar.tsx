'use client'

interface ProgressBarProps {
  pct: number
  label: string
  sublabel?: string
  note?: string
  id?: string
  href?: string
}

export default function ProgressBar({ pct, label, sublabel, note, id, href }: ProgressBarProps) {
  const clamp = Math.min(Math.max(pct, 2), 100)
  const barColor = pct >= 90 ? '#000000' : pct >= 70 ? '#555555' : '#999999'

  const inner = (
    <>
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-2">
          {id && (
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-ink3">
              {id}
            </span>
          )}
          <span className="text-sm font-bold">{label}</span>
          {sublabel && <span className="text-xs text-ink4">{sublabel}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold" style={{ color: barColor }}>
            {pct}%
          </span>
          {href && <span className="text-ink4 text-xs">↗</span>}
        </div>
      </div>
      <div className="h-1.5 bg-sand3 w-full">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${clamp}%`, background: barColor }}
        />
      </div>
      {note && <div className="text-xs text-ink3 font-medium mt-1">{note}</div>}
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block mb-4 hover:bg-sand3/40 -mx-3 px-3 py-1 rounded transition-colors"
      >
        {inner}
      </a>
    )
  }

  return <div className="mb-4">{inner}</div>
}
