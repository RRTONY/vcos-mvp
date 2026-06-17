'use client'

import React from 'react'

// Renders the light markdown that Fireflies returns in summaries / action items
// (**bold**, bullet lines, blank-line spacing) the way it appears in Fireflies —
// instead of showing raw ** asterisks and dashes.

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  // Split on **bold** spans, keeping the delimiters via a capture group.
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/)
    if (m) return <strong key={`${keyBase}-b${i}`} className="font-semibold text-ink">{m[1]}</strong>
    return <React.Fragment key={`${keyBase}-t${i}`}>{part}</React.Fragment>
  })
}

export default function FormattedNotes({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let bullets: string[] = []
  let k = 0

  const flushBullets = () => {
    if (!bullets.length) return
    const items = bullets
    blocks.push(
      <ul key={`ul-${k++}`} className="list-disc pl-5 space-y-0.5">
        {items.map((b, i) => <li key={i}>{renderInline(b, `li-${k}-${i}`)}</li>)}
      </ul>
    )
    bullets = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushBullets(); continue }

    const bullet = line.match(/^[-*•]\s+(.*)/)
    if (bullet) { bullets.push(bullet[1]); continue }

    flushBullets()
    // A line that is only a bold span acts as a sub-heading (e.g. a person's name).
    if (/^\*\*[^*]+\*\*:?$/.test(line)) {
      blocks.push(<div key={`h-${k++}`} className="font-semibold text-ink mt-2 first:mt-0">{renderInline(line, `h${k}`)}</div>)
    } else {
      blocks.push(<p key={`p-${k++}`}>{renderInline(line, `p${k}`)}</p>)
    }
  }
  flushBullets()

  return <div className={`space-y-1 ${className}`}>{blocks}</div>
}
