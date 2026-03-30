import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { MEMBER_IDS } from '@/lib/webwork'

const BUCKET = 'vcos-screenshots'
const SIGNED_URL_EXPIRY = 3600 // 1 hour

// GET /api/screenshots?date=YYYY-MM-DD
// Returns { [member]: [{ url, filename, capturedAt }] }
// Requires x-role header (set by middleware)
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)

  const supabase = getSupabase()
  const members = Object.keys(MEMBER_IDS)
  const result: Record<string, { url: string; filename: string; capturedAt: string | null }[]> = {}

  await Promise.all(
    members.map(async (member) => {
      const prefix = `${member}/${date}`

      // List files in this member/date folder
      const { data: files, error } = await supabase.storage
        .from(BUCKET)
        .list(prefix, { limit: 200, sortBy: { column: 'name', order: 'asc' } })

      if (error || !files || files.length === 0) {
        result[member] = []
        return
      }

      // Build full storage paths
      const paths = files
        .filter(f => f.name.toLowerCase().endsWith('.png'))
        .map(f => `${prefix}/${f.name}`)

      if (paths.length === 0) {
        result[member] = []
        return
      }

      // Generate signed URLs (private bucket)
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_URL_EXPIRY)

      if (signErr || !signed) {
        result[member] = []
        return
      }

      result[member] = signed
        .filter(s => s.signedUrl)
        .map((s, i) => ({
          url: s.signedUrl,
          filename: files[i]?.name ?? '',
          // Extract time from filename if format is HH-MM-SS.png or similar
          capturedAt: extractTime(files[i]?.name ?? ''),
        }))
    })
  )

  return NextResponse.json({ date, screenshots: result })
}

// Try to extract a readable time from filename like "09-15-32.png" → "09:15"
function extractTime(filename: string): string | null {
  const match = filename.match(/(\d{2})-(\d{2})/)
  if (match) return `${match[1]}:${match[2]}`
  return null
}
