const BASE = 'https://api.webwork-tracker.com/api/v2'

function headers() {
  return { Authorization: `Bearer ${process.env.WEBWORK_API_KEY}` }
}

// WebWork member IDs mapped to VCOS usernames
export const MEMBER_IDS: Record<string, number> = {
  kim:    368177,  // Kimberly Dofredo
  chase:  239825,  // Chase Angkay
  alex:   240057,  // Alex Veytsel
  daniel: 404312,  // Daniel Baez
  josh:   225823,  // Josh Bykowski
  rob:    390198,  // Rob Holmes
  tony:   224775,  // Tony Greenberg
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
  const results = await Promise.all(
    Object.entries(MEMBER_IDS).map(async ([username, userId]) => {
      try {
        const { totalMinutes, byDay } = await getWeekHours(userId, weekDates)
        return {
          username,
          totalMinutes,
          totalHours: Math.round(totalMinutes / 60 * 10) / 10,
          byDay: byDay.map(d => ({ date: d.date, minutes: d.minutes, hours: Math.round(d.minutes / 60 * 10) / 10 })),
        }
      } catch {
        return { username, totalMinutes: 0, totalHours: 0, byDay: [] }
      }
    })
  )
  return { week: weekDates, members: results }
}

// Returns Mon–Sun dates for the current week
export function getCurrentWeekDates(): string[] {
  const today = new Date()
  const day = today.getDay() // 0=Sun
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}
