'use client'

import { useState, useRef, useEffect } from 'react'
import { FiCalendar, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { getMondayOfWeekPT, fmtWeekRange } from '@/lib/week-utils'

const mostRecentMonday = getMondayOfWeekPT
export const fmtWeek = fmtWeekRange

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Calendar popover for picking a week. Clicking any day selects the Monday of
 * that week. All past weeks are selectable; future weeks are selectable too
 * unless `maxMonday` caps it (e.g. the weekly-report form disables anything
 * past the current week). The trigger shows the selected week label —
 * clicking it (or the input area) opens the calendar.
 */
export default function WeekCalendar({
  selectedMonday,
  onSelectWeek,
  maxMonday,
}: {
  selectedMonday: Date
  onSelectWeek: (monday: Date) => void
  maxMonday?: Date
}) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => new Date(Date.UTC(selectedMonday.getUTCFullYear(), selectedMonday.getUTCMonth(), 1, 12)))
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
    if (open) setViewMonth(new Date(Date.UTC(selectedMonday.getUTCFullYear(), selectedMonday.getUTCMonth(), 1, 12)))
  }, [open, selectedMonday])

  const currentWeekMon = mostRecentMonday(new Date())

  const year = viewMonth.getUTCFullYear()
  const month = viewMonth.getUTCMonth()
  const firstOfMonth = new Date(Date.UTC(year, month, 1, 12)) // noon UTC = same calendar day in PT
  const leadBlanks = (firstOfMonth.getDay() + 6) % 7 // getDay() on noon UTC = correct PT day-of-week
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(Date.UTC(year, month, i + 1, 12))),
  ]

  const selWeekTime = mostRecentMonday(selectedMonday).getTime()
  const currentWeekTime = currentWeekMon.getTime()
  const maxWeekTime = maxMonday ? mostRecentMonday(maxMonday).getTime() : null

  function pick(day: Date) {
    if (maxWeekTime !== null && mostRecentMonday(day).getTime() > maxWeekTime) return
    onSelectWeek(mostRecentMonday(day))
    setOpen(false)
  }

  return (
    <div className="relative w-full" ref={ref}>
      {/* Trigger — clicking anywhere on this row opens the calendar */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="field-input w-full flex items-center justify-between gap-2 text-left cursor-pointer hover:bg-sand3 transition-colors"
        title="Click to pick a week"
      >
        <span className="font-semibold text-ink">{fmtWeek(selectedMonday)}</span>
        <FiCalendar className="w-4 h-4 text-ink4 shrink-0" aria-hidden />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-sand border border-sand4 rounded-lg shadow-card-md p-3 w-[17rem]">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(Date.UTC(year, month - 1, 1, 12)))}
              className="text-ink4 hover:text-ink w-6 h-6 flex items-center justify-center rounded hover:bg-sand3"
            ><FiChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-bold uppercase tracking-widest">{MONTHS[month]} {year}</span>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(Date.UTC(year, month + 1, 1, 12)))}
              className="text-ink4 hover:text-ink w-6 h-6 flex items-center justify-center rounded hover:bg-sand3"
            ><FiChevronRight className="w-4 h-4" /></button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-ink4">{d}</div>
            ))}
          </div>

          {/* Days — all past weeks selectable; future weeks disabled if maxMonday caps them */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const inSelWeek = mostRecentMonday(day).getTime() === selWeekTime
              const isCurrentWeek = mostRecentMonday(day).getTime() === currentWeekTime
              const isToday = day.toDateString() === new Date().toDateString()
              const disabled = maxWeekTime !== null && mostRecentMonday(day).getTime() > maxWeekTime
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(day)}
                  disabled={disabled}
                  className={`h-7 text-xs rounded flex items-center justify-center transition-colors ${
                    disabled
                      ? 'text-ink4/40 cursor-not-allowed'
                      : inSelWeek
                      ? 'bg-accent text-white font-bold'
                      : 'text-ink2 hover:bg-sand3'
                  } ${isToday && !inSelWeek ? 'ring-1 ring-accent' : ''} ${isCurrentWeek && !inSelWeek ? 'font-semibold text-ink' : ''}`}
                  title={disabled ? 'Future weeks can\'t be selected' : fmtWeek(mostRecentMonday(day))}
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
