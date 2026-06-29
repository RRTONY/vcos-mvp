import { getTeamMembers } from './team-db'
import { getMondayOfWeekPT, shiftWeeks, weekStartISO } from './week-utils'

const BASE = 'https://api.webwork-tracker.com/api/v2'

function headers() {
  return { Authorization: `Bearer ${process.env.WEBWORK_API_KEY}` }
}

export interface DayHours {
  date: string
  minutes: number
  entries: { task: string; project: string; minutes: number; start: string; end: string }[]
}

export async function getMemberHours(userId: number, date: string): Promise<DayHours> {
  const res = await fetch(`${BASE}/time-entries?user_id=${userId}&date=${date}`, { headers: headers() })
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
  }
}

export async function getWeekHours(userId: number, weekDates: string[]): Promise<{ totalMinutes: number; byDay: DayHours[] }> {
  const byDay = await Promise.all(weekDates.map(d => getMemberHours(userId, d)))
  return {
    totalMinutes: byDay.reduce((s, d) => s + d.minutes, 0),
    byDay,
  }
}

export async function buildWebWorkSnapshot() {
  const weekDates = getCurrentWeekDates()
  const lastWeekDates = getLastWeekDates()

  const teamMembers = await getTeamMembers()
  const trackable = teamMembers.filter(m => m.webwork_user_id)

  const results = await Promise.all(
    trackable.map(async (member) => {
      const userId = parseInt(member.webwork_user_id!, 10)
      const username = member.vcos_username ?? member.full_name.split(' ')[0].toLowerCase()
      try {
        const [{ totalMinutes, byDay }, { totalMinutes: lastMinutes }] = await Promise.all([
          getWeekHours(userId, weekDates),
          getWeekHours(userId, lastWeekDates),
        ])
        return {
          username,
          totalMinutes,
          totalHours: Math.round(totalMinutes / 60 * 10) / 10,
          lastWeekHours: Math.round(lastMinutes / 60 * 10) / 10,
          byDay: byDay.map(d => ({ date: d.date, minutes: d.minutes, hours: Math.round(d.minutes / 60 * 10) / 10 })),
        }
      } catch {
        return { username, totalMinutes: 0, totalHours: 0, lastWeekHours: 0, byDay: [] }
      }
    })
  )
  return { week: weekDates, lastWeek: lastWeekDates, members: results }
}

// Returns Mon–Sun PT-calendar dates for the current week. Anchored to PT (not
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
