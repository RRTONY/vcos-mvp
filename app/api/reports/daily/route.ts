import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { setCache } from '@/lib/api-cache'
import { buildClickUpSnapshot } from '@/lib/clickup'
import { buildSlackSnapshot } from '@/lib/slack'
import { buildWebWorkSnapshot } from '@/lib/webwork'
import { buildFirefliesSnapshot } from '@/lib/fireflies'

async function generateDailyReport() {
  const today = new Date().toISOString().slice(0, 10)
  const baseUrl = process.env.ALLOWED_ORIGIN?.replace(/\/$/, '') ?? 'http://localhost:3000'

  // Fetch all sources in parallel using snapshot builders + systems status
  const [slackRes, clickupRes, webworkRes, firefliesRes, systemsRes] = await Promise.allSettled([
    buildSlackSnapshot(),
    buildClickUpSnapshot(),
    buildWebWorkSnapshot(),
    buildFirefliesSnapshot(),
    fetch(`${baseUrl}/api/systems-status`).then(r => r.json()),
  ])

  const slack   = slackRes.status   === 'fulfilled' ? slackRes.value   : null
  const clickup = clickupRes.status === 'fulfilled' ? clickupRes.value : null
  const webwork = webworkRes.status === 'fulfilled' ? webworkRes.value : null
  const systems = systemsRes.status === 'fulfilled' ? systemsRes.value : null

  // Persist all snapshots to unified cache
  await Promise.allSettled([
    slack   ? setCache('slack',      slack)   : Promise.resolve(),
    clickup ? setCache('clickup',    clickup) : Promise.resolve(),
    webwork ? setCache('webwork',    webwork) : Promise.resolve(),
    firefliesRes.status === 'fulfilled' ? setCache('fireflies', firefliesRes.value) : Promise.resolve(),
  ])

  const teamHours: Record<string, number> = {}
  for (const m of (webwork?.members ?? [])) {
    teamHours[m.username] = m.totalHours
  }

  const filed: string[] = slack?.weeklyReports?.filed ?? []
  const missing: string[] = slack?.weeklyReports?.missing ?? []
  const overdueCount = clickup?.overdue ?? 0
  const urgentCount = clickup?.urgent ?? 0
  const totalTasks = clickup?.totalTasks ?? 0
  const totalHours = Object.values(teamHours).reduce((s: number, h) => s + (h as number), 0)

  // System health summary
  const systemHealth: Record<string, string> = {}
  if (systems?.systems) {
    for (const s of systems.systems) {
      systemHealth[s.name] = s.status
    }
  }

  // Store in Supabase
  const { error } = await supabase.from('vcos_daily_reports').upsert({
    report_date: today,
    reports_filed: filed,
    reports_missing: missing,
    overdue_count: overdueCount,
    urgent_count: urgentCount,
    total_tasks: totalTasks,
    team_hours: teamHours,
    system_health: systemHealth,
  }, { onConflict: 'report_date' })

  if (error) throw new Error(error.message)

  // Post to Slack
  const slackToken = process.env.SLACK_BOT_TOKEN
  const channel = process.env.SLACK_ADMIN_CHANNEL ?? 'C08MKQ2PH2R'
  const dayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  const systemLine = Object.entries(systemHealth)
    .map(([name, status]) => `${status === 'ok' ? '●' : '✕'} ${name}`)
    .join(' · ')

  const slackMsg = [
    `📊 *VCOS Daily Brief — ${dayLabel}*`,
    ``,
    `✅ Reports Filed (${filed.length}/8): ${filed.length ? filed.map(n => n.split(' ')[0]).join(' · ') : 'none'}`,
    missing.length ? `❌ Missing (${missing.length}): ${missing.map(n => n.split(' ')[0]).join(' · ')}` : `✅ All reports filed`,
    ``,
    `⚠️ CRM: ${overdueCount} overdue of ${totalTasks} tasks · ${urgentCount} urgent`,
    `🕐 Team Hours This Week: ${Math.round(totalHours)}h logged`,
    ``,
    `Systems: ${systemLine || 'No data'}`,
    ``,
    `→ Full dashboard: ${baseUrl}`,
  ].join('\n')

  let slackTs: string | undefined
  if (slackToken) {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${slackToken}` },
      body: JSON.stringify({ channel, text: slackMsg }),
    })
    const d = await res.json()
    slackTs = d.ts
    // Store slack_message_ts
    if (slackTs) {
      await supabase.from('vcos_daily_reports').update({ slack_message_ts: slackTs }).eq('report_date', today)
    }
  }

  return { date: today, filed: filed.length, missing: missing.length, overdueCount, urgentCount, totalHours, slackTs }
}

// POST — generate now (admin only, or from scheduled function)
export async function POST(req: NextRequest) {
  const role = req.headers.get('x-role')
  const secret = req.headers.get('x-cron-secret')
  const isScheduled = secret === process.env.CRON_SECRET

  if (!isScheduled && !['admin', 'owner'].includes(role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await generateDailyReport()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// GET — fetch report history
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')

  if (date) {
    const { data } = await supabase.from('vcos_daily_reports').select('*').eq('report_date', date).single()
    return NextResponse.json(data ?? null)
  }

  const { data } = await supabase
    .from('vcos_daily_reports')
    .select('report_date, reports_filed, reports_missing, overdue_count, urgent_count, total_tasks, team_hours, slack_message_ts')
    .order('report_date', { ascending: false })
    .limit(30)

  return NextResponse.json(data ?? [])
}
