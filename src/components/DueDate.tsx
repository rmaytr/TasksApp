import { useState } from 'react'
import { addDays, dueTone, formatDue, fromISODate, parseDateToken, todayISO } from '../lib/dates'
import type { Horizon } from '../model/types'
import { Icon } from './Icon'
import './DueDate.css'

/** A deadline as one readable pill: calendar icon, "Fri, Oct 23", colored by how close it is. */
export function DuePill({ due, now, prefix }: { due: string; now: Date; prefix?: string }) {
  const tone = dueTone(due, now)
  return (
    <span className={`due due--${tone} num`} title={tone === 'overdue' ? 'Past its date' : undefined}>
      <Icon name="calendar" size={13} />
      {prefix && <span className="due__prefix">{prefix}</span>}
      {formatDue(due, now)}
    </span>
  )
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const NO_DATE: readonly { horizon: Horizon; label: string }[] = [
  { horizon: 'week', label: 'This week' },
  { horizon: 'later', label: 'Later' },
  { horizon: 'someday', label: 'Someday' },
]

const iso = (d: Date): string => todayISO(d)

interface DatePickerProps {
  due: string | null
  horizon: Horizon
  now: Date
  onPick: (due: string) => void
  onNoDate: (horizon: Horizon) => void
}

/** Quick picks, a month calendar, and "no deadline" buckets for things without a date. */
export function DatePicker({ due, horizon, now, onPick, onNoDate }: DatePickerProps) {
  const today = todayISO(now)
  const start = fromISODate(due ?? today)
  const [month, setMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1))

  const quick = [
    { label: 'Today', due: today },
    { label: 'Tomorrow', due: addDays(today, 1) },
    { label: 'This weekend', due: parseDateToken('this weekend', now)?.due },
    { label: 'Next week', due: parseDateToken('next week', now)?.due },
  ].filter((q): q is { label: string; due: string } => Boolean(q.due))
  // Two picks can land on the same day (e.g. "Tomorrow" on a Friday is the weekend).
  const seen = new Set<string>()
  const picks = quick.filter((q) => !seen.has(q.due) && seen.add(q.due))

  const firstWeekday = month.getDay()
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ]
  const shift = (by: number): void => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1))
  const monthName = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="picker">
      <div className="picker__quick" role="group" aria-label="Quick dates">
        {picks.map((q) => (
          <button key={q.label} type="button" className="picker__q" aria-pressed={due === q.due} onClick={() => onPick(q.due)}>
            <span>{q.label}</span>
            <small className="num">{fromISODate(q.due).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</small>
          </button>
        ))}
      </div>

      <div className="picker__cal">
        <div className="picker__head">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
            <Icon name="chevronLeft" size={18} />
          </button>
          <span className="picker__month" aria-live="polite">
            {monthName}
          </span>
          <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next month">
            <Icon name="chevron" size={18} />
          </button>
        </div>
        <div className="picker__grid" role="group" aria-label={monthName}>
          {WEEKDAYS.map((w) => (
            <span key={w} className="picker__wd" aria-hidden="true">
              {w}
            </span>
          ))}
          {cells.map((day, i) =>
            day === null ? (
              <span key={`pad-${i}`} />
            ) : (
              <button
                key={day}
                type="button"
                className={`picker__day num${day === today ? ' is-today' : ''}${day < today ? ' is-past' : ''}`}
                aria-pressed={day === due}
                aria-label={fromISODate(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                onClick={() => onPick(day)}
              >
                {fromISODate(day).getDate()}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="picker__none" role="group" aria-label="No deadline">
        <span className="picker__none-label">No deadline</span>
        {NO_DATE.map((n) => (
          <button
            key={n.horizon}
            type="button"
            className="chip"
            aria-pressed={!due && horizon === n.horizon}
            onClick={() => onNoDate(n.horizon)}
          >
            {n.label}
          </button>
        ))}
      </div>
    </div>
  )
}
