import { getTeamMembers } from './team-db'
import { getMondayOfWeekPT, shiftWeeks, weekStartISO } from './week-utils'

const BASE = 'https://api.webwork-tracker.com/api/v2'

function headers() {
  return { Authorization: `Bearer ${process.env.WEBWORK_API_KEY}` }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface DayHours {
  date: string
  minutes: number
  entries: { task: string; project: string; minutes: number; start: string; end: string }[]
  ok: boolean
}

// A failed request here used to silently resolve to "0 minutes," which is
// indistinguishable from a real zero — that's what made missing hours (e.g.
// a member's tracker "not coming through") impossible to tell apart from
// genuinely not having worked. Now a non-2xx response is retried a couple
// times before being marked `ok: false` so callers can flag it instead of
// quietly reporting a wrong number.
export async function getMemberHours(userId: number, date: string, attempt = 0): Promise<DayHours> {
  const MAX_ATTEMPTS = 3
  let res: Response
  try {
    res = await fetch(`${BASE}/time-entries?user_id=${userId}&date=${date}`, { headers: headers() })
  } catch {
    if (attempt + 1 < MAX_ATTEMPTS) {
      await sleep(300 * (attempt + 1))
      return getMemberHours(userId, date, attempt + 1)
    }
    return { date, minutes: 0, entries: [], ok: false }
  }

  if (!res.ok) {
    if (attempt + 1 < MAX_ATTEMPTS) {
      await sleep(300 * (attempt + 1))
      return getMemberHours(userId, date, attempt + 1)
    }
    console.error(`WebWork time-entries failed for user ${userId} on ${date}: HTTP ${res.status}`)
    return { date, minutes: 0, entries: [], ok: false }
  }

  const data = await res.json()
  const entries = (data.data ?? []).map((e: {
    task_title: string; project_name: string; total_minutes: number; start_time: string; end_time: string
  }) => ({
    task: e.task_title,
    project: e.project_name,
    minutes: e.total_minutes,
    start: e.start_time,
    end: e.end_time,
  }))
  return {
    date,
    minutes: entries.reduce((s: number, e: { minutes: number }) => s + e.minutes, 0),
    entries,
    ok: true,
  }
}

export async function getWeekHours(userId: number, weekDates: string[]): Promise<{ totalMinutes: number; byDay: DayHours[]; incomplete: boolean }> {
  const byDay = await Promise.all(weekDates.map(d => getMemberHours(userId, d)))
  return {
    totalMinutes: byDay.reduce((s, d) => s + d.minutes, 0),
    byDay,
    incomplete: byDay.some(d => !d.ok),
  }
}

// Defaults to the current PT week. Pass a specific Monday to fetch any other
// week (used by the Team Hours date picker) — those calls bypass the Supabase
// cache entirely and hit WebWork live, since only the current week is cached.
export async function buildWebWorkSnapshot(weekMonday?: Date) {
  const weekDates = weekMonday ? weekDatesFrom(weekMonday) : getCurrentWeekDates()
  const lastWeekDates = weekMonday ? weekDatesFrom(shiftWeeks(weekMonday, -1)) : getLastWeekDates()

  const teamMembers = await getTeamMembers()
  const trackable = teamMembers.filter(m => m.webwork_user_id)

  const raw = await Promise.all(
    trackable.map(async (member) => {
      const userId = parseInt(member.webwork_user_id!, 10)
      const username = member.vcos_username ?? member.full_name.split(' ')[0].toLowerCase()
      try {
        const [{ totalMinutes, byDay, incomplete: thisIncomplete }, { totalMinutes: lastMinutes, incomplete: lastIncomplete }] = await Promise.all([
          getWeekHours(userId, weekDates),
          getWeekHours(userId, lastWeekDates),
        ])
        return { username, totalMinutes, lastMinutes, byDay, incomplete: thisIncomplete || lastIncomplete }
      } catch {
        return { username, totalMinutes: 0, lastMinutes: 0, byDay: [] as DayHours[], incomplete: true }
      }
    })
  )

  const members = raw.map(r => ({
    username: r.username,
    totalMinutes: r.totalMinutes,
    totalHours: Math.round(r.totalMinutes / 60 * 10) / 10,
    lastWeekHours: Math.round(r.lastMinutes / 60 * 10) / 10,
    byDay: r.byDay.map(d => ({ date: d.date, minutes: d.minutes, hours: Math.round(d.minutes / 60 * 10) / 10 })),
    incomplete: r.incomplete,
  }))

  return {
    week: weekDates,
    lastWeek: lastWeekDates,
    members,
    projects: buildProjectBreakdown(raw),
    incomplete: members.some(m => m.incomplete),
  }
}

// Reshapes this week's raw time entries (task/project per day, per member)
// into a project-first view: which projects have activity, who logged time
// against them, and which tasks. ClickUp only tracks *assigned* tasks; this is
// what people are actually clocking hours against, which can differ.
function buildProjectBreakdown(raw: { username: string; byDay: DayHours[] }[]) {
  const projects = new Map<string, Map<string, Map<string, number>>>() // project -> username -> task -> minutes

  for (const member of raw) {
    for (const day of member.byDay) {
      for (const entry of day.entries) {
        const project = entry.project || 'No project'
        const task = entry.task || 'Untitled task'
        if (!projects.has(project)) projects.set(project, new Map())
        const byUser = projects.get(project)!
        if (!byUser.has(member.username)) byUser.set(member.username, new Map())
        const byTask = byUser.get(member.username)!
        byTask.set(task, (byTask.get(task) ?? 0) + entry.minutes)
      }
    }
  }

  const result = Array.from(projects.entries()).map(([project, byUser]) => {
    const members = Array.from(byUser.entries()).map(([username, byTask]) => {
      const tasks = Array.from(byTask.entries())
        .map(([task, minutes]) => ({ task, minutes, hours: Math.round(minutes / 60 * 10) / 10 }))
        .sort((a, b) => b.minutes - a.minutes)
      const minutes = tasks.reduce((s, t) => s + t.minutes, 0)
      return { username, minutes, hours: Math.round(minutes / 60 * 10) / 10, tasks }
    }).sort((a, b) => b.minutes - a.minutes)
    const minutes = members.reduce((s, m) => s + m.minutes, 0)
    return { project, minutes, hours: Math.round(minutes / 60 * 10) / 10, members }
  }).sort((a, b) => b.minutes - a.minutes)

  return result
}

// Returns Mon–Sun PT-calendar dates for the given week. Anchored to PT (not
// server/browser local time) so this agrees with week-utils everywhere, including
// on IST dev machines where local getDay()/setDate() + toISOString() (UTC) can disagree.
function weekDatesFrom(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + i, 12))
    return weekStartISO(d)
  })
}

export function getCurrentWeekDates(): string[] {
  return weekDatesFrom(getMondayOfWeekPT())
}

// Returns Mon–Sun PT-calendar dates for the previous week
export function getLastWeekDates(): string[] {
  return weekDatesFrom(shiftWeeks(getMondayOfWeekPT(), -1))
}
