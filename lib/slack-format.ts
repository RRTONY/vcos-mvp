// Slack has no HTML renderer — messages are plain text with Slack's own
// "mrkdwn" markup (*bold*, _italic_, <url|label>, • bullets). Anything typed
// in the rich-text editor is converted here before it ever leaves the client,
// so raw HTML never reaches the API, the database, or Slack.
export function htmlToSlackMrkdwn(html: string): string {
  if (!html) return ''
  let out = html
  out = out.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '<$1|$2>')
  out = out.replace(/<(strong|b)>(.*?)<\/\1>/gi, '*$2*')
  out = out.replace(/<(em|i)>(.*?)<\/\1>/gi, '_$2_')
  out = out.replace(/<u>(.*?)<\/u>/gi, '$1') // Slack mrkdwn has no underline
  out = out.replace(/<li>(.*?)<\/li>/gi, '• $1\n')
  out = out.replace(/<br\s*\/?>/gi, '\n')
  out = out.replace(/<\/(div|p|ul|ol)>/gi, '\n')
  out = out.replace(/<[^>]+>/g, '')
  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  return out
}
