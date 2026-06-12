'use client'

import { useState, useRef, useEffect } from 'react'
import { FiCalendar, FiChevronLeft, FiChevronRight } from 'react-icons/fi'

function mostRecentMonday(from: Date): Date {
  const d = new Date(from)
  const daysSinceMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - daysSinceMonday)
  d.setHours(0, 0, 0, 0)
  return d
}

function fmtWeek(mon: Date): string {
  const fri = new Date(mon)
  fri.setDate(mon.getDate() + 4)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(mon)}–${fmt(fri)}`
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Calendar popover for picking a week. Clicking any day selects the Monday of
 * that week. Highlights the currently-selected Mon–Sun week. Future weeks beyond
 * the current week are disabled (you can't browse a week that hasn't happened).
 */
export default function WeekCalendar({
  selectedMonday,
  onSelectWeek,
}: {
  selectedMonday: Date
  onSelectWeek: (monday: Date) => void
}) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => new Date(selectedMonday.getFullYear(), selectedMonday.getMonth(), 1))
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  // When opening, jump the view to the selected week's month
  useEffect(() => {
    if (open) setViewMonth(new Date(selectedMonday.getFullYear(), selectedMonday.getMonth(), 1))
  }, [open, selectedMonday])

  const currentWeekMon = mostRecentMonday(new Date())

  // Build the grid: leading blanks (Mon-start) + days of month
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const leadBlanks = (firstOfMonth.getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]

  const selWeekTime = mostRecentMonday(selectedMonday).getTime()

  function pick(day: Date) {
    const mon = mostRecentMonday(day)
    if (mon.getTime() > currentWeekMon.getTime()) return // no future weeks
    onSelectWeek(mon)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-sand4 rounded-lg text-ink3 hover:bg-sand3 hover:text-ink transition-colors"
        title="Pick a week from the calendar"
      >
        <FiCalendar className="w-3.5 h-3.5" aria-hidden />
        <span className="hidden sm:inline">Calendar</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 right-0 sm:left-0 bg-sand border border-sand4 rounded-lg shadow-card-md p-3 w-[16rem]">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              className="text-ink4 hover:text-ink w-6 h-6 flex items-center justify-center rounded hover:bg-sand3"
            ><FiChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-bold uppercase tracking-widest">{MONTHS[month]} {year}</span>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              className="text-ink4 hover:text-ink w-6 h-6 flex items-center justify-center rounded hover:bg-sand3"
            ><FiChevronRight className="w-4 h-4" /></button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-ink4">{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const inSelWeek = mostRecentMonday(day).getTime() === selWeekTime
              const isFuture = mostRecentMonday(day).getTime() > currentWeekMon.getTime()
              const isToday = day.toDateString() === new Date().toDateString()
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isFuture}
                  onClick={() => pick(day)}
                  className={`h-7 text-xs rounded flex items-center justify-center transition-colors ${
                    inSelWeek ? 'bg-accent text-white font-bold'
                    : isFuture ? 'text-ink4/40 cursor-not-allowed'
                    : 'text-ink2 hover:bg-sand3'
                  } ${isToday && !inSelWeek ? 'ring-1 ring-accent' : ''}`}
                  title={fmtWeek(mostRecentMonday(day))}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => { onSelectWeek(currentWeekMon); setOpen(false) }}
            className="w-full mt-2 text-xs text-accent hover:underline"
          >
            Jump to current week
          </button>
        </div>
      )}
    </div>
  )
}
