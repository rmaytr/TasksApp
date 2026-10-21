import { addDays, daysBetween, fromISODate, horizonForDue, toISODate, todayISO } from '../lib/dates'
import type { Repeat, Task } from './types'

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'Doesn’t repeat',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
}

/** `anchor` moved `k` months forward, clamped to the month's last day (Jan 31 → Feb 28 → Mar 31). */
function addMonths(anchor: string, k: number): string {
  const a = fromISODate(anchor)
  const first = new Date(a.getFullYear(), a.getMonth() + k, 1)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  first.setDate(Math.min(a.getDate(), lastDay))
  return toISODate(first)
}

function monthIndex(iso: string): number {
  const d = fromISODate(iso)
  return d.getFullYear() * 12 + d.getMonth()
}

/** The first occurrence strictly after both the current due date and today. */
export function nextDue(repeat: Exclude<Repeat, 'none'>, due: string, anchor: string, today: string): string {
  if (repeat !== 'monthly') {
    const step = repeat === 'daily' ? 1 : 7
    const gap = daysBetween(due, today)
    // Jump straight past today instead of stepping one interval at a time.
    const n = gap < 0 ? 1 : Math.floor(gap / step) + 1
    return addDays(due, n * step)
  }
  // Months are counted from the anchor so a month-end date never drifts to the 28th.
  let k = Math.max(monthIndex(due), monthIndex(today)) - monthIndex(anchor)
  let next = addMonths(anchor, k)
  while (next <= due || next <= today) next = addMonths(anchor, ++k)
  return next
}

/**
 * The next copy of a repeating task once the current one is done: same content,
 * steps unchecked, due date moved forward past today. `repeatOf` links it to the
 * task that spawned it so un-checking that task can withdraw it.
 */
export function nextOccurrence(task: Task, now: Date, newId: () => string): Task | null {
  const repeat = task.repeat ?? 'none'
  if (repeat === 'none') return null
  const today = todayISO(now)
  const base = task.due ?? today
  const anchor = task.repeatAnchor ?? base
  const due = nextDue(repeat, base, anchor, today)
  const time = now.getTime()
  return {
    ...task,
    id: newId(),
    due,
    horizon: horizonForDue(due, now) ?? task.horizon,
    steps: task.steps.map((s) => ({ ...s, id: newId(), done: false })),
    done: false,
    doneAt: null,
    createdAt: time,
    updatedAt: time,
    spentMinutes: 0,
    repeatOf: task.id,
    ...(repeat === 'monthly' && { repeatAnchor: anchor }),
  }
}
