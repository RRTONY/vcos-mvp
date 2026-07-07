import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { postMessage } from '@/lib/slack'
import { getSupabase } from '@/lib/supabase'
import { getTeamMemberByUsername } from '@/lib/team-db'
import { parseWeekStart, fmtWeekRange, weekLabelVariants } from '@/lib/week-utils'

import { SLACK_CHANNEL_WEEKLY_REPORTS } from '@/lib/constants'
const SLACK_CHANNEL = process.env.SLACK_CHANNEL_WEEKLY_REPORTS ?? SLACK_CHANNEL_WEEKLY_REPORTS

function isManager(role: string | null): boolean {
  return role === 'admin' || role === 'owner'
}

interface ReportBody {
  name: string
  week: string
  blockers?: string
  escalations?: string
  priorities?: string
  goals_met?: string
  win?: string
  accomplishments?: string
  friction?: string
  went_well?: string
  support_needed?: string
  whats_new?: string
}

interface AiAnalysis {
  summary: string
  insights: string[]
  actions: string[]
}

async function analyzeReport(report: ReportBody): Promise<AiAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY_REPORTS
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })

  const prompt = `You are analyzing a weekly report from ${report.name} for the week of ${report.week}. Provide a concise executive analysis.

Report:
1. Blocked/stuck/at risk: ${report.blockers || '—'}
2. Escalations needed: ${report.escalations || '—'}
3. Next week priorities: ${report.priorities || '—'}
4. Last week priorities — done vs. not done: ${report.goals_met || '—'}
5. Most important accomplishment & business impact: ${report.win || '—'}
6. Full accomplishments by area: ${report.accomplishments || '—'}
7. What didn't go well: ${report.friction || '—'}
8. What went well: ${report.went_well || '—'}
9. Support needed from others: ${report.support_needed || '—'}

Respond with valid JSON only:
{
  "summary": "2-3 sentence executive summary of this person's week",
  "insights": ["2-4 key observations about performance, patterns, or growth areas"],
  "actions": ["2-3 specific recommended actions for management to consider"]
}`

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as AiAnalysis
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  let body: ReportBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { week } = body
  let { name } = body
  if (!week) {
    return NextResponse.json({ error: 'week is required' }, { status: 400 })
  }

  // Non-managers may only submit a report as themselves — ignore any client-set
  // name and force their own mapped full name. Managers can submit for anyone.
  const role = req.headers.get('x-role')
  const username = req.headers.get('x-user')
  if (!isManager(role)) {
    const member = username ? await getTeamMemberByUsername(username) : null
    if (!member?.full_name) {
      return NextResponse.json({ error: 'Your account is not linked to a team member, so you cannot submit a report. Contact an admin.' }, { status: 403 })
    }
    name = member.full_name
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  body.name = name

  const lines: string[] = [
    '#myweeklyreport',
    '',
    `*Weekly Report — ${name} — ${week}*`,
    '',
    `*1. What is blocked, stuck, or at risk right now?*\n${body.blockers || '—'}`,
    '',
    `*2. Is anything broken, behind, or needs to be escalated?*\n${body.escalations || '—'}`,
    '',
    `*3. Top 3–5 priorities for next week*\n${body.priorities || '—'}`,
    '',
    `*4. Last week's priorities — done vs. not done*\n${body.goals_met || '—'}`,
    '',
    `*5. Most important accomplishment & business impact*\n${body.win || '—'}`,
    '',
    `*6. Full accomplishments by area*\n${body.accomplishments || '—'}`,
    '',
    `*7. What didn't go well — and what should change?*\n${body.friction || '—'}`,
    '',
    `*8. What went well that's worth repeating or recognizing?*\n${body.went_well || '—'}`,
    '',
    `*9. What you need from others*\n${body.support_needed || '—'}`,
  ]
  if (body.whats_new) lines.push('', `*10. Personal notes*\n${body.whats_new}`)

  const slackMsg = lines.join('\n')

  const contentFields = [body.blockers, body.escalations, body.priorities, body.goals_met, body.win, body.accomplishments, body.friction, body.went_well, body.support_needed]
  const hasContent = contentFields.some(f => f && f.trim().length > 0)

  const [analysisResult, slackResult] = await Promise.allSettled([
    hasContent ? analyzeReport(body) : Promise.resolve(null),
    postMessage(SLACK_CHANNEL, slackMsg),
  ])

  const aiAnalysis = analysisResult.status === 'fulfilled' ? analysisResult.value : null
  const slackTs = slackResult.status === 'fulfilled'
    ? (slackResult.value as { ts?: string })?.ts ?? null
    : null

  const sb = getSupabase()
  const fields = {
    submitted_by: name,
    week_label: week,
    blockers: body.blockers ?? null,
    escalations: body.escalations ?? null,
    priorities: body.priorities ?? null,
    goals_met: body.goals_met ?? null,
    win: body.win ?? null,
    accomplishments: body.accomplishments ?? null,
    friction: body.friction ?? null,
    went_well: body.went_well ?? null,
    support_needed: body.support_needed ?? null,
    whats_new: body.whats_new ?? null,
    ai_analysis: aiAnalysis,
    slack_ts: slackTs,
  }

  // Resubmitting for a week you already filed (e.g. correcting the week you
  // picked) edits that report in place instead of creating a duplicate row.
  const { data: existing } = await sb
    .from('weekly_reports')
    .select('id')
    .eq('submitted_by', name)
    .eq('week_label', week)
    .maybeSingle()

  const { data, error } = existing
    ? await sb.from('weekly_reports').update(fields).eq('id', existing.id).select('id').single()
    : await sb.from('weekly_reports').insert(fields).select('id').single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data.id, analysis: aiAnalysis })
}

export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const weekStart = req.nextUrl.searchParams.get('week_start')

  // Non-managers may only read their own reports.
  let ownName: string | null = null
  if (!isManager(role)) {
    const username = req.headers.get('x-user')
    const member = username ? await getTeamMemberByUsername(username) : null
    // Unlinked non-manager → no reports they can see.
    if (!member?.full_name) return NextResponse.json([])
    ownName = member.full_name
  }

  const sb = getSupabase()
  let query = sb
    .from('weekly_reports')
    .select('id, submitted_by, week_label, blockers, escalations, priorities, goals_met, win, accomplishments, friction, went_well, support_needed, whats_new, ai_analysis, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (ownName) query = query.eq('submitted_by', ownName)

  if (weekStart) {
    // Use both the correct PT label and the IST-shifted variant (1 day earlier).
    // Old reports from IST users stored labels 1 day back due to the midnight-IST bug.
    const labels = weekLabelVariants(parseWeekStart(weekStart))
    query = query.in('week_label', labels)
  }

  const { data } = await query
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
