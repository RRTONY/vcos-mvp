'use client'

import React from 'react'

// Shared lightweight markdown renderer (no external dependency, fast to load).
// Handles: headings, **bold**/__bold__, *italic*, `code`, [links](url),
// bulleted + numbered lists, blockquotes, horizontal rules, and GFM tables.
// Used by the VCoS-AI chat and reusable anywhere markdown needs rendering.

// ── Inline ──
export function renderInline(s: string, kb: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*\s][^*]*?)\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g
  let last = 0, i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) nodes.push(<span key={`${kb}t${i++}`}>{s.slice(last, m.index)}</span>)
    if (m[1]) nodes.push(<strong key={`${kb}b${i++}`} className="font-semibold text-ink">{m[2]}</strong>)
    else if (m[3]) nodes.push(<strong key={`${kb}b${i++}`} className="font-semibold text-ink">{m[4]}</strong>)
    else if (m[5]) nodes.push(<em key={`${kb}i${i++}`}>{m[6]}</em>)
    else if (m[7]) nodes.push(<code key={`${kb}c${i++}`} className="font-mono text-[13px] bg-sand3 px-1 rounded">{m[8]}</code>)
    else if (m[9]) nodes.push(<a key={`${kb}a${i++}`} href={m[11]} target="_blank" rel="noopener noreferrer" className="text-accent underline">{m[10]}</a>)
    last = re.lastIndex
  }
  if (last < s.length) nodes.push(<span key={`${kb}t${i++}`}>{s.slice(last)}</span>)
  return nodes
}

// ── Table helpers ──
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map(c => c.trim())
}
const isTableRow = (line: string) => line.includes('|') && line.trim() !== ''
const isSeparator = (line: string) => {
  const cells = splitRow(line)
  return cells.length > 0 && cells.every(c => /^:?-{1,}:?$/.test(c.replace(/\s/g, '')))
}

// ── Block-level ──
export default function Markdown({ text, className = 'text-sm leading-relaxed' }: { text: string; className?: string }) {
  const out: React.ReactNode[] = []
  let ul: string[] = []; let ol: string[] = []; let k = 0
  const flushUl = () => { if (ul.length) { const items = ul; out.push(<ul key={`ul${k++}`} className="list-disc pl-5 space-y-0.5 my-1.5">{items.map((b, i) => <li key={i}>{renderInline(b, `ul${k}-${i}`)}</li>)}</ul>); ul = [] } }
  const flushOl = () => { if (ol.length) { const items = ol; out.push(<ol key={`ol${k++}`} className="list-decimal pl-5 space-y-0.5 my-1.5">{items.map((b, i) => <li key={i}>{renderInline(b, `ol${k}-${i}`)}</li>)}</ol>); ol = [] } }
  const flush = () => { flushUl(); flushOl() }
  const lines = text.split('\n')
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trimEnd()
    if (!line.trim()) { flush(); continue }

    // GFM table: header row followed by a |---|---| separator.
    if (isTableRow(line) && idx + 1 < lines.length && isSeparator(lines[idx + 1])) {
      flush()
      const header = splitRow(line)
      const rows: string[][] = []
      let j = idx + 2
      while (j < lines.length && lines[j].trim() && isTableRow(lines[j])) { rows.push(splitRow(lines[j])); j++ }
      const ti = k++
      out.push(
        <div key={`tbl${ti}`} className="my-2 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>{header.map((c, i) => <th key={i} className="border border-sand4 bg-sand3 px-2.5 py-1.5 text-left font-semibold">{renderInline(c, `th${ti}-${i}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className={ri % 2 ? 'bg-sand2' : ''}>
                  {header.map((_, ci) => <td key={ci} className="border border-sand4 px-2.5 py-1.5 align-top">{renderInline(r[ci] ?? '', `td${ti}-${ri}-${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      idx = j - 1
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flush(); out.push(<hr key={`hr${k++}`} className="border-sand4 my-2.5" />); continue }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) { flush(); const lv = h[1].length; out.push(<div key={`h${k++}`} className={`font-bold text-ink mt-3 first:mt-0 ${lv <= 1 ? 'text-base' : 'text-sm'}`}>{renderInline(h[2], `h${k}`)}</div>); continue }
    const bq = line.match(/^>\s?(.*)/); if (bq) { flush(); out.push(<blockquote key={`bq${k++}`} className="border-l-2 border-sand4 pl-3 text-ink3 my-1.5">{renderInline(bq[1], `bq${k}`)}</blockquote>); continue }
    const ulm = line.match(/^\s*[-*•]\s+(.*)/); if (ulm) { flushOl(); ul.push(ulm[1]); continue }
    const olm = line.match(/^\s*\d+[.)]\s+(.*)/); if (olm) { flushUl(); ol.push(olm[1]); continue }
    flush(); out.push(<p key={`p${k++}`} className="my-1">{renderInline(line, `p${k}`)}</p>)
  }
  flush()
  return <div className={className}>{out}</div>
}
