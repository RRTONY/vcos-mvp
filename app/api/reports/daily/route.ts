import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { MEMBER_IDS, getWeekHours, getCurrentWeekDates } from '@/lib/webwork'

async function generateDailyReport() {
  const today = new Date().toISOString().slice(0, 10)

  // Fetch all data sources in parallel
  const baseUrl = process.env.ALLOWED_ORIGIN?.replace(/\/$/, '') ?? 'http://localhost:3000'
  const [slackRes, clickupRes, systemsRes] = await Promise.allSettled([
    fetch(`${baseUrl}/api/slack-stats`).then(r => r.json()),
    fetch(`${baseUrl}/api/clickup-tasks`).then(r => r.json()),
    fetch(`${baseUrl}/api/systems-status`).then(r => r.json()),
  ])

  const slack = slackRes.status === 'fulfilled' ? slackRes.value : null
  const clickup = clickupRes.status === 'fulfilled' ? clickupRes.value : null
  const systems = systemsRes.status === 'fulfilled' ? systemsRes.value : null

  // WebWork hours for today
  const weekDates = getCurrentWeekDates()
  const teamHours: Record<string, number> = {}
  await Promise.all(
    Object.entries(MEMBER_IDS).map(async ([username, userId]) => {
      try {
        const { totalMinutes } = await getWeekHours(userId, weekDates)
        teamHours[username] = Math.round(totalMinutes / 60 * 10) / 10
      } catch { teamHours[username] = 0 }
    })
  )

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

  if (!isScheduled && role !== 'admin') {
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
