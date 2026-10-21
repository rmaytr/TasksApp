import { addDays, fromISODate, horizonForDue, toISODate, todayISO } from '../lib/dates'
import type { Repeat, Task } from './types'

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'Doesn’t repeat',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
}

function advance(iso: string, repeat: Exclude<Repeat, 'none'>): string {
  if (repeat === 'daily') return addDays(iso, 1)
  if (repeat === 'weekly') return addDays(iso, 7)
  const d = fromISODate(iso)
  const day = d.getDate()
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  // Clamp to the month's last day (Jan 31 → Feb 28), never spill into the month after.
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(day, lastDay))
  return toISODate(next)
}

/**
 * The next copy of a repeating task once the current one is done: same content,
 * steps unchecked, due date moved forward past today.
 */
export function nextOccurrence(task: Task, now: Date, newId: () => string): Task | null {
  const repeat = task.repeat ?? 'none'
  if (repeat === 'none') return null
  const today = todayISO(now)
  let due = advance(task.due ?? today, repeat)
  while (due <= today) due = advance(due, repeat)
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
  }
}
