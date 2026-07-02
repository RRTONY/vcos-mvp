import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getTeamMemberByUsername } from '@/lib/team-db'
import { meetingDeadlinePassed, meetingTypeOf, parseMeetingDate } from '@/lib/meeting-prep'
import { sanitizeHtml } from '@/lib/sanitize-html'

function isManager(role: string | null): boolean {
  return role === 'admin' || role === 'owner'
}

interface PrepBody {
  name: string
  meeting_date: string // YYYY-MM-DD, PT calendar
  wins?: string
  priorities?: string
  blockers?: string
  decisions?: string
  fyis?: string
}

export async function POST(req: NextRequest) {
  let body: PrepBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { meeting_date } = body
  let { name } = body
  if (!meeting_date) return NextResponse.json({ error: 'meeting_date is required' }, { status: 400 })

  const role = req.headers.get('x-role')
  const username = req.headers.get('x-user')
  const manager = isManager(role)

  // Non-managers may only submit as themselves, and only before the deadline.
  // Managers can submit on behalf of anyone and may still edit after the
  // deadline (e.g. to fix a typo before the meeting starts).
  if (!manager) {
    const member = username ? await getTeamMemberByUsername(username) : null
    if (!member?.full_name) {
      return NextResponse.json({ error: 'Your account is not linked to a team member, so you cannot submit an update. Contact an admin.' }, { status: 403 })
    }
    name = member.full_name

    if (meetingDeadlinePassed(parseMeetingDate(meeting_date))) {
      return NextResponse.json({ error: 'The submission deadline for this meeting has passed.' }, { status: 403 })
    }
  }
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const sb = getSupabase()
  const { data, error } = await sb
    .from('meeting_prep_updates')
    .upsert({
      submitted_by: name,
      meeting_date,
      meeting_type: meetingTypeOf(parseMeetingDate(meeting_date)),
      wins: sanitizeHtml(body.wins ?? ''),
      priorities: sanitizeHtml(body.priorities ?? ''),
      blockers: sanitizeHtml(body.blockers ?? ''),
      decisions: sanitizeHtml(body.decisions ?? ''),
      fyis: sanitizeHtml(body.fyis ?? ''),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'submitted_by,meeting_date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meetingDate = req.nextUrl.searchParams.get('meeting_date')
  if (!meetingDate) return NextResponse.json({ error: 'meeting_date is required' }, { status: 400 })

  // Non-managers may only read their own update; managers see everyone's
  // (needed for the grouped-by-category leadership view).
  let ownName: string | null = null
  if (!isManager(role)) {
    const username = req.headers.get('x-user')
    const member = username ? await getTeamMemberByUsername(username) : null
    if (!member?.full_name) return NextResponse.json([])
    ownName = member.full_name
  }

  const sb = getSupabase()
  let query = sb.from('meeting_prep_updates').select('*').eq('meeting_date', meetingDate)
  if (ownName) query = query.eq('submitted_by', ownName)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN ?? '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
