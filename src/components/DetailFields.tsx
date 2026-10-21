import { useState, type ReactNode } from 'react'
import { addDays, fromISODate, parseDateToken, todayISO } from '../lib/dates'
import { extractLinks } from '../lib/links'
import { REPEAT_LABEL } from '../model/repeat'
import { REPEATS, type Repeat, type Task } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'

interface FieldProps {
  task: Task
  now: Date
}

/** Due date as one-tap chips, with the native picker for anything else. */
export function DueField({ task, now }: FieldProps) {
  const updateTask = useStore((s) => s.updateTask)
  const today = todayISO(now)
  const friday = parseDateToken('fri', now)?.due
  const nextWeek = parseDateToken('next week', now)?.due
  const options = [
    { label: 'Today', due: today },
    { label: 'Tomorrow', due: addDays(today, 1) },
    ...(friday && friday !== today && friday !== addDays(today, 1) ? [{ label: 'Fri', due: friday }] : []),
    ...(nextWeek ? [{ label: 'Next week', due: nextWeek }] : []),
  ]
  const set = (due: string | null): void => updateTask(task.id, { due })
  const long = task.due
    ? fromISODate(task.due).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : null

  return (
    <div className="detail__due">
      <span className="detail__label">Due</span>
      <div className="detail__chips" role="group" aria-label="Due date">
        {options.map((o) => (
          <button key={o.label} type="button" className="detail__chip" aria-pressed={task.due === o.due} onClick={() => set(o.due)}>
            {o.label}
          </button>
        ))}
        <label className="detail__chip detail__chip--pick">
          <Icon name="clock" size={14} />
          <span>{long ?? 'Pick a date'}</span>
          <input type="date" value={task.due ?? ''} onChange={(e) => set(e.target.value || null)} aria-label="Pick a due date" />
        </label>
        {task.due && (
          <button type="button" className="detail__chip detail__chip--clear" onClick={() => set(null)} aria-label="Clear due date">
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export function RepeatField({ task }: { task: Task }) {
  const updateTask = useStore((s) => s.updateTask)
  const value = task.repeat ?? 'none'
  return (
    <label className="detail__inline">
      <Icon name="repeat" size={16} />
      <span className="visually-hidden">Repeats</span>
      <select
        className="field detail__select"
        value={value}
        aria-label="Repeats"
        onChange={(e) => updateTask(task.id, { repeat: e.target.value as Repeat })}
      >
        {REPEATS.map((r) => (
          <option key={r} value={r}>
            {REPEAT_LABEL[r]}
          </option>
        ))}
      </select>
    </label>
  )
}

interface OptionalProps {
  label: string
  addLabel: string
  hasValue: boolean
  children: ReactNode
}

/** An optional field that stays a small "+ Add …" chip until it's needed. */
export function OptionalField({ label, addLabel, hasValue, children }: OptionalProps) {
  const [open, setOpen] = useState(hasValue)
  if (!open && !hasValue) {
    return (
      <button type="button" className="detail__add-field" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} /> {addLabel}
      </button>
    )
  }
  return (
    <label className="detail__group">
      <span className="detail__label">{label}</span>
      {children}
    </label>
  )
}

/** Links found in the title or notes, as chips that open in a new tab. */
export function LinkChips({ task }: { task: Task }) {
  const links = extractLinks(`${task.title}\n${task.notes}`)
  if (links.length === 0) return null
  return (
    <div className="detail__links">
      {links.map((l) => (
        <a key={l.url} className="detail__chip detail__chip--link" href={l.url} target="_blank" rel="noopener noreferrer">
          <Icon name="link" size={14} /> {l.host}
        </a>
      ))}
    </div>
  )
}
