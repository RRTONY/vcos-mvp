interface Props {
  ageMinutes?: number
  circuitOpen?: boolean
  error?: string
}

/**
 * Shows a subtle warning when data is served from a stale cache.
 * Renders nothing when data is fresh.
 */
export default function StaleBadge({ ageMinutes, circuitOpen, error }: Props) {
  if (!ageMinutes && !circuitOpen && !error) return null

  if (circuitOpen) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 border border-red-200">
        ⚡ API circuit open
      </span>
    )
  }

  if (error && !ageMinutes) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
        ⚠ {error}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-ink4 border border-sand3 px-1.5 py-0.5">
      cached {ageMinutes}m ago
    </span>
  )
}
