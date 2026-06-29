'use client'

import { useState, useRef, useEffect } from 'react'
import { FiCalendar, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { ptDateISO, todayPT } from '@/lib/week-utils'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Calendar popover for picking a single date (PT calendar). Used to look up a
 * specific day's report instead of paging through a flat history list.
 */
export default function DayCalendar({
  selectedDate,
  onSelectDate,
  markedDates,
}: {
  selectedDate: string // YYYY-MM-DD (PT)
  onSelectDate: (date: string) => void
  markedDates?: Set<string> // dates that have a report — shown with a dot
}) {
  const [open, setOpen] = useState(false)
  const sel = new Date(`${selectedDate}T12:00:00Z`)
  const [viewMonth, setViewMonth] = useState(() => new Date(Date.UTC(sel.getUTCFullYear(), sel.getUTCMonth(), 1, 12)))
  const ref = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (open) setViewMonth(new Date(Date.UTC(sel.getUTCFullYear(), sel.getUTCMonth(), 1, 12)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedDate])

  const today = todayPT()
  const year = viewMonth.getUTCFullYear()
  const month = viewMonth.getUTCMonth()
  const firstOfMonth = new Date(Date.UTC(year, month, 1, 12))
  const leadBlanks = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(Date.UTC(year, month, i + 1, 12))),
  ]

  function pick(day: Date) {
    onSelectDate(ptDateISO(day))
    setOpen(false)
  }

  const label = new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="relative w-full sm:w-auto" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="field-input w-full sm:w-auto flex items-center justify-between gap-2 text-left cursor-pointer hover:bg-sand3 transition-colors"
        title="Click to pick a date"
      >
        <span className="font-semibold text-ink">{label}</span>
        <FiCalendar className="w-4 h-4 text-ink4 shrink-0" aria-hidden />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-sand border border-sand4 rounded-lg shadow-card-md p-3 w-[17rem]">
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

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-ink4">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const iso = ptDateISO(day)
              const isSel = iso === selectedDate
              const isToday = iso === today
              const hasReport = markedDates?.has(iso)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(day)}
                  className={`relative h-7 text-xs rounded flex items-center justify-center transition-colors ${
                    isSel ? 'bg-accent text-white font-bold' : 'text-ink2 hover:bg-sand3'
                  } ${isToday && !isSel ? 'ring-1 ring-accent' : ''}`}
                  title={iso}
                >
                  {day.getDate()}
                  {hasReport && !isSel && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-accent" />}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => { onSelectDate(today); setOpen(false) }}
            className="w-full mt-2 text-xs text-accent hover:underline"
          >
            Jump to today
          </button>
        </div>
      )}
    </div>
  )
}
