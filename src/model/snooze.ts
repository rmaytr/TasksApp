import { addDays, formatDue, todayISO } from '../lib/dates'
import { effectiveHorizon } from './derive'
import { HORIZONS, HORIZON_LABEL, type Horizon, type Task } from './types'

export interface Snooze {
  patch: { due?: string; horizon?: Horizon }
  /** What the toast says: "Snoozed to Tomorrow", "Snoozed to This month". */
  label: string
}

/**
 * "Not now": a dated task moves one day past today or its date, whichever is later (so an
 * overdue task lands on tomorrow); an undated one moves one bucket out (Today -> This week ->
 * This month -> Later -> Someday).
 */
export function snooze(task: Task, now: Date): Snooze {
  const today = todayISO(now)
  if (task.due) {
    const due = addDays(task.due > today ? task.due : today, 1)
    return { patch: { due }, label: `Snoozed to ${formatDue(due, now)}` }
  }
  const at = HORIZONS.indexOf(effectiveHorizon(task, now))
  const horizon = HORIZONS[Math.min(at + 1, HORIZONS.length - 1)] ?? 'someday'
  return { patch: { horizon }, label: `Snoozed to ${HORIZON_LABEL[horizon]}` }
}
