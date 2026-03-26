import { NextRequest, NextResponse } from 'next/server'
import { MEMBER_IDS, getWeekHours, getCurrentWeekDates } from '@/lib/webwork'

export async function GET(req: NextRequest) {
  const role = req.headers.get('x-role')
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  return NextResponse.json({ week: weekDates, members: results })
}
