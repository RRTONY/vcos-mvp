// Team Performance brief — AI synthesis.
// GET  → return the last generated brief (cached in vcos_api_cache).
// POST → (admin/owner) gather this week's reports + ClickUp data, ask Claude to
//        synthesize an agenda + recommendations, store it, and return it.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '@/lib/supabase'
import { getTeamMembers } from '@/lib/team-db'
import { getCached, getCachedSWR, recordSuccess } from '@/lib/api-cache'
import type { ClickUpData } from '@/lib/types'

export const dynamic = 'force-dynamic'
const SOURCE = 'kickoff-brief'

import { getMondayOfWeekPT, fmtWeekRange, weekStartISO, weekLabelVariants } from '@/lib/week-utils'
const mostRecentMonday = getMondayOfWeekPT

export async function GET() {
  const row = await getCached(SOURCE).catch(() => null)
  return NextResponse.json({ brief: row?.data ?? null, generatedAt: row?.fetched_at ?? null })
}

export async function POST(req: NextRequest) {
  if (!['admin', 'owner'].includes(req.headers.get('x-role') ?? '')) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  const mon = mostRecentMonday(new Date())
  const weekStart = weekStartISO(mon)
  const weekLabel = fmtWeekRange(mon)

  const sb = getSupabase()
  const [{ data: reports }, members, cu] = await Promise.all([
    sb.from('weekly_reports')
      .select('submitted_by, created_at, blockers, escalations, priorities, goals_met, win, accomplishments, support_needed')
      .in('week_label', weekLabelVariants(mon))
      .order('created_at', { ascending: true }),
    getTeamMembers().catch(() => []),
    getCachedSWR<ClickUpData>('clickup').then(r => r.data).catch(() => null),
  ])

  const reportRows = reports ?? []
  const reportingMembers = members.filter(m => m.files_report)
  const submittedNames = new Set(reportRows.map(r => r.submitted_by))
  const missing = reportingMembers.filter(m => !submittedNames.has(m.full_name)).map(m => m.full_name)

  // Per-person ClickUp load (overdue/urgent) for context.
  const cuByPerson = reportingMembers.map(m => {
    const cuKey = (m.clickup_key ?? m.full_name.split(' ')[0]).toLowerCase()
    const stats = cu?.assigneeStats ? Object.entries(cu.assigneeStats).find(([k]) => k.includes(cuKey))?.[1] : null
    return { name: m.full_name, total: stats?.total ?? 0, overdue: stats?.overdue ?? 0, urgent: stats?.urgent ?? 0 }
  })

  const context = {
    weekLabel,
    reports: reportRows.map(r => ({
      name: r.submitted_by,
      blockers: r.blockers, escalations: r.escalations, priorities: r.priorities,
      lastWeek: r.goals_met, win: r.win, accomplishments: r.accomplishments, support: r.support_needed,
    })),
    missingReports: missing,
    clickup: { overall: { totalTasks: cu?.totalTasks ?? 0, overduePercent: cu?.overduePercent ?? 0, urgent: cu?.urgent ?? 0 }, perPerson: cuByPerson },
  }

  const prompt = `You are the Chief of Staff for RampRate, preparing the Monday team-performance brief for the CEO (Tony Greenberg) for the week of ${weekLabel}.

Using ONLY the data below (weekly reports, who is missing a report, and ClickUp task load), produce a concise executive brief.

DATA:
${JSON.stringify(context, null, 2)}

Respond with VALID JSON ONLY in exactly this shape:
{
  "summary": "2-3 sentence executive summary of the week",
  "agenda": [
    { "title": "short action-oriented agenda item", "detail": "1-2 sentences of context and the decision/action needed", "urgency": "fire" | "high" | "normal", "owner": "person or 'Tony'" }
  ],
  "recommendations": {
    "critical": [ { "title": "...", "body": "1-2 sentences", "action": "the specific action + owner" } ],
    "high":     [ { "title": "...", "body": "...", "action": "..." } ],
    "positive": [ { "title": "recognize someone", "body": "why it matters" } ]
  }
}

Rules: order the agenda by urgency (fire first). 4-8 agenda items. 1-3 critical, 1-4 high, 2-4 positive. Be specific and reference real names/work from the data. No markdown, no prose outside the JSON.`

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'AI returned no JSON' }, { status: 502 })
    const brief = { weekLabel, ...JSON.parse(match[0]) }
    await recordSuccess(SOURCE, brief)
    return NextResponse.json({ brief, generatedAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI synthesis failed' }, { status: 502 })
  }
}
