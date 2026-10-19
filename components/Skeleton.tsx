// Loading placeholders - use these instead of "Loading…" text so a page keeps
// its shape while data arrives.
export default function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse bg-sand3 rounded ${className}`} />
}

/** Stacked list rows (title + subtitle), e.g. tables and lists. */
export function SkeletonRows({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`grid gap-2.5 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-xl border border-sand4 bg-sand px-4 py-3.5">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/4 mt-2.5" />
        </div>
      ))}
    </div>
  )
}

/** Grid of cards, e.g. tiles. */
export function SkeletonCards({ count = 6, className = '' }: { count?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`grid gap-4 ${className}`}
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-sand4 bg-sand p-5">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-6 w-3/5 mt-4" />
          <Skeleton className="h-3.5 w-full mt-3" />
          <Skeleton className="h-3.5 w-4/5 mt-2" />
        </div>
      ))}
    </div>
  )
}

/** Row of number tiles. */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="kpi-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="kpi">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3.5 w-28 mt-1" />
        </div>
      ))}
    </div>
  )
}
