import { horizonForDue, nearerHorizon } from '../lib/dates'
import { HORIZONS, type Horizon, type Task } from './types'

/** Days without an edit after which a task is drawn faded and surfaced first in Reset. */
export const STALE_DAYS = 14
const DAY_MS = 86_400_000

/** The ring a task is drawn on: the user's choice, pulled in by an approaching due date. */
export function effectiveHorizon(task: Task, now: Date): Horizon {
  return nearerHorizon(task.horizon, horizonForDue(task.due, now))
}

export function isStale(task: Task, now: Date): boolean {
  return !task.done && now.getTime() - task.updatedAt > STALE_DAYS * DAY_MS
}

export function stepProgress(task: Task): number {
  if (task.steps.length === 0) return task.done ? 1 : 0
  return task.steps.filter((s) => s.done).length / task.steps.length
}

export function nextStep(task: Task): Task['steps'][number] | null {
  return task.steps.find((s) => !s.done) ?? null
}

export function horizonIndex(h: Horizon): number {
  return HORIZONS.indexOf(h)
}

/** Nearest ring first, then high priority, then earliest due date, then oldest. */
export function compareUrgency(a: Task, b: Task, now: Date): number {
  return (
    horizonIndex(effectiveHorizon(a, now)) - horizonIndex(effectiveHorizon(b, now)) ||
    Number(b.high) - Number(a.high) ||
    (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
    a.createdAt - b.createdAt
  )
}

export function openTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => !t.done)
}

/** Monday 00:00 local of the week containing `now`, epoch ms. */
export function startOfWeek(now: Date): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d.getTime()
}

export function doneThisWeek(tasks: readonly Task[], now: Date): number {
  const since = startOfWeek(now)
  return tasks.filter((t) => t.done && (t.doneAt ?? 0) >= since).length
}
