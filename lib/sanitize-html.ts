// Minimal allowlist sanitizer for rich-text fields (Meeting Prep updates).
// Strips everything except the tags RichTextEditor's toolbar can actually
// produce, and forces safe `href`/`target` on links. Applied server-side
// before storage so leadership-view rendering can trust the stored HTML.
const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'br', 'div', 'p', 'span'])

export function sanitizeHtml(html: string): string {
  if (!html) return ''
  let out = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, tag: string, attrs: string) => {
    const t = tag.toLowerCase()
    if (!ALLOWED_TAGS.has(t)) return ''
    if (match.startsWith('</')) return `</${t}>`
    if (t === 'a') {
      const hrefMatch = attrs.match(/href\s*=\s*"([^"]*)"/i)
      const href = hrefMatch?.[1] ?? ''
      const safeHref = /^https?:\/\//i.test(href) ? href : '#'
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">`
    }
    return `<${t}>`
  })
  return out.trim()
}
