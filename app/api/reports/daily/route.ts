import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { setCache } from '@/lib/api-cache'
import { buildClickUpSnapshot } from '@/lib/clickup'
import { buildSlackSnapshot } from '@/lib/slack'
import { buildWebWorkSnapshot } from '@/lib/webwork'
import { buildFirefliesSnapshot } from '@/lib/fireflies'
import { SLACK_CHANNEL_WEEKLY_REPORTS, SLACK_ADMIN_CHANNEL } from '@/lib/constants'
import { todayPT } from '@/lib/week-utils'

async function generateDailyReport() {
  const today = todayPT()
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
  const channel = process.env.SLACK_ADMIN_CHANNEL ?? SLACK_ADMIN_CHANNEL
  const dayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  const systemLine = Object.entries(systemHealth)
    .map(([name, status]) => `${status === 'ok' ? '●' : '✕'} ${name}`)
    .join(' · ')

  const slackMsg = [
    `📊 *VCOS Daily Brief — ${dayLabel}*`,
    ``,
    `✅ Reports Filed (${filed.length}/${filed.length + missing.length}): ${filed.length ? filed.map(n => n.split(' ')[0]).join(' · ') : 'none'}`,
    missing.length ? `❌ Missing (${missing.length}): ${missing.map(n => n.split(' ')[0]).join(' · ')}` : `✅ All reports filed`,
    ``,
    `⚠️ CRM: ${overdueCount} overdue of ${totalTasks} tasks · ${urgentCount} urgent`,
    `🕐 Team Hours This Week: ${Math.round(totalHours)}h logged`,
    ``,
    `Systems: ${systemLine || 'No data'}`,
    ``,
    `→ Full dashboard: ${baseUrl}`,
  ].join('\n')

  const WEEKLY_REPORTS_CHANNEL = process.env.SLACK_CHANNEL_WEEKLY_REPORTS ?? SLACK_CHANNEL_WEEKLY_REPORTS

  const weeklyReportTemplate = [
    `#myweeklyreport`,
    ``,
    `1. What business outcomes did you drive this week?`,
    `2. Did you accomplish your top goals from last week? If not, why not?`,
    `3. Deliverables Authored or Significantly Edited`,
    `4. Automations built or improved`,
    `5. Processes Executed`,
    `6. Automation ROI this week`,
    `7. Key deals & relationships nurtured`,
    `8. Help Needed / Dependencies / Blockers`,
    `9. Most Interesting Thing You Heard / Read This Week`,
    `10. Top 3-5 Priorities for Next Week`,
    `11. Win of the Week`,
    `12. (Optional) Kudos`,
    `13. (Optional) Friction`,
    `14. (Optional) What's new with you?`,
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

    // Post reminder to #weeklyreports if anyone is missing
    if (missing.length > 0) {
      const names = missing.map(n => n.split(' ')[0]).join(', ')
      const reminderMsg = [
        `📋 *Weekly Report Reminder — ${dayLabel}*`,
        ``,
        `${names} — your weekly report hasn't been submitted yet this week.`,
        ``,
        `Please post your report in this channel using the template below. Make sure to include *#myweeklyreport* at the top so it's counted in the system.`,
        ``,
        `\`\`\``,
        weeklyReportTemplate,
        `\`\`\``,
      ].join('\n')

      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${slackToken}` },
        body: JSON.stringify({ channel: WEEKLY_REPORTS_CHANNEL, text: reminderMsg }),
      })
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
