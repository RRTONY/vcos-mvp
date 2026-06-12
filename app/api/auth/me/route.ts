import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifySession } from '@/lib/auth'
import { getTeamMemberByUsername } from '@/lib/team-db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const session = await verifySession(token)
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

  // Bridge auth identity → team-member record so the client knows the user's
  // report name (weekly_reports.submitted_by) and whether they file reports.
  let fullName: string | null = null
  let filesReport = false
  try {
    const member = await getTeamMemberByUsername(session.username)
    if (member) {
      fullName = member.full_name
      filesReport = member.files_report
    }
  } catch { /* non-fatal — identity still returned */ }

  return NextResponse.json({
    username: session.username,
    role: session.role,
    fullName,
    filesReport,
  })
}
