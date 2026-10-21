import { addDays, daysBetween, fromISODate, todayISO } from '../lib/dates'
import { priorityOf, type Priority, type Task } from '../model/types'

/* -------------------------------------------------------------------------- */
/* Heads-up                                                                   */
/* -------------------------------------------------------------------------- */

export interface HeadsUp {
  overdue: Task[]
  today: Task[]
  tomorrow: Task[]
  /** Due in 2-3 days. */
  soon: Task[]
}

const SOON_LAST_DAY = 3
const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 }

/** Earlier due date first, then high priority first, then oldest, then id (stable for equal tasks). */
function compareDueThenPriority(a: Task, b: Task): number {
  return (
    (a.due ?? '').localeCompare(b.due ?? '') ||
    PRIORITY_RANK[priorityOf(a)] - PRIORITY_RANK[priorityOf(b)] ||
    a.createdAt - b.createdAt ||
    a.id.localeCompare(b.id)
  )
}

/** Open tasks with a due date, grouped by how close it is. Each list: due date, then priority. */
export function headsUp(tasks: readonly Task[], now: Date): HeadsUp {
  const today = todayISO(now)
  const dated = tasks.filter((t): t is Task & { due: string } => !t.done && t.due !== null).sort(compareDueThenPriority)
  const within = (t: { due: string }, test: (days: number) => boolean): boolean => test(daysBetween(today, t.due))
  return {
    overdue: dated.filter((t) => within(t, (d) => d < 0)),
    today: dated.filter((t) => within(t, (d) => d === 0)),
    tomorrow: dated.filter((t) => within(t, (d) => d === 1)),
    soon: dated.filter((t) => within(t, (d) => d >= 2 && d <= SOON_LAST_DAY)),
  }
}

/* -------------------------------------------------------------------------- */
/* Reminders                                                                  */
/* -------------------------------------------------------------------------- */

export interface ReminderSettings {
  /** Local hour 0-23 at which "today" and "overdue" reminders start. */
  morningHour: number
  /** Local hour 0-23 from which the "due tomorrow" heads-up is sent the evening before. */
  eveningHour: number
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { morningHour: 9, eveningHour: 18 }

type TaskReminderKind = 'evening-before' | 'morning-of' | 'overdue'

export interface Reminder {
  /** `${kind}:${taskId}:${due}` for a single task; `summary:${YYYY-MM-DD}:${kind|mixed}:${count}` for a summary. */
  key: string
  taskIds: string[]
  title: string
  body: string
  kind: TaskReminderKind | 'summary'
}

/** More reminders than this at once collapse into a single summary. */
const MAX_INDIVIDUAL_REMINDERS = 3
const SUMMARY_TITLES_SHOWN = 3
const KIND_ORDER: Record<TaskReminderKind, number> = { overdue: 0, 'morning-of': 1, 'evening-before': 2 }
const SUMMARY_KEY_PREFIX = 'summary:'

const clampHour = (hour: number, fallback: number): number =>
  Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.floor(hour))) : fallback

const taskKey = (kind: TaskReminderKind, taskId: string, due: string): string => `${kind}:${taskId}:${due}`

/**
 * Which reminder a task is eligible for on the calendar day `today` at local hour `hour`.
 *   due tomorrow + evening hour reached  -> evening-before (a missed window is never replayed)
 *   due today + morning hour reached     -> morning-of (still fires late in the day)
 *   past due + morning hour reached      -> overdue (once per due date; the key carries the date)
 */
function kindFor(due: string, today: string, hour: number, settings: ReminderSettings): TaskReminderKind | null {
  const days = daysBetween(today, due)
  const morning = clampHour(settings.morningHour, DEFAULT_REMINDER_SETTINGS.morningHour)
  const evening = clampHour(settings.eveningHour, DEFAULT_REMINDER_SETTINGS.eveningHour)
  if (days === 1) return hour >= evening ? 'evening-before' : null
  if (days === 0) return hour >= morning ? 'morning-of' : null
  if (days < 0) return hour >= morning ? 'overdue' : null
  return null
}

function stepsDone(task: Task): number {
  return task.steps.filter((s) => s.done).length
}

/** Gentle context line: step progress, "Quick one", or nothing. */
function bodyFor(task: Task): string {
  const done = stepsDone(task)
  if (done > 0) return `${done} of ${task.steps.length} ${task.steps.length === 1 ? 'step' : 'steps'} done`
  return task.effort === 's' ? 'Quick one' : ''
}

const TITLE_PREFIX: Record<TaskReminderKind, string> = {
  'evening-before': 'Due tomorrow',
  'morning-of': 'Today',
  overdue: 'Still open',
}

interface Candidate {
  task: Task & { due: string }
  kind: TaskReminderKind
}

function summarise(candidates: readonly Candidate[], today: string): Reminder {
  const kinds = new Set(candidates.map((c) => c.kind))
  const kindLabel = kinds.size === 1 ? [...kinds][0] : 'mixed'
  const shown = candidates.slice(0, SUMMARY_TITLES_SHOWN).map((c) => c.task.title)
  const more = candidates.length - shown.length
  return {
    key: `${SUMMARY_KEY_PREFIX}${today}:${kindLabel}:${candidates.length}`,
    taskIds: candidates.map((c) => c.task.id),
    title: `${candidates.length} tasks need attention`,
    body: more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', '),
    kind: 'summary',
  }
}

/**
 * Reminders that should be shown right now: open dated tasks whose window has opened
 * and whose key is not in `fired`. More than 3 at once become a single summary whose
 * individual keys (see `reminderKeys`) the caller should mark fired as well.
 * Ordered overdue, today, tomorrow; within a kind by due date, then priority.
 */
export function dueReminders(
  tasks: readonly Task[],
  now: Date,
  settings: ReminderSettings,
  fired: ReadonlySet<string>,
): Reminder[] {
  const today = todayISO(now)
  const hour = now.getHours()
  const candidates: Candidate[] = []
  for (const task of tasks) {
    if (task.done || task.due === null) continue
    const kind = kindFor(task.due, today, hour, settings)
    if (kind !== null && !fired.has(taskKey(kind, task.id, task.due))) candidates.push({ task: { ...task, due: task.due }, kind })
  }
  candidates.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || compareDueThenPriority(a.task, b.task))

  if (candidates.length > MAX_INDIVIDUAL_REMINDERS) {
    const summary = summarise(candidates, today)
    return fired.has(summary.key) ? [] : [summary]
  }
  return candidates.map(({ task, kind }) => ({
    key: taskKey(kind, task.id, task.due),
    taskIds: [task.id],
    title: `${TITLE_PREFIX[kind]}: ${task.title}`,
    body: bodyFor(task),
    kind,
  }))
}

/**
 * The individual keys a reminder stands for: just its own key, or for a summary the
 * key of each covered (still open, still dated) task as it stood on the summary's day.
 */
export function reminderKeys(reminder: Reminder, tasks: readonly Task[]): string[] {
  if (reminder.kind !== 'summary') return [reminder.key]
  const day = /^summary:(\d{4}-\d{2}-\d{2}):/.exec(reminder.key)?.[1]
  if (day === undefined) return []
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return reminder.taskIds.flatMap((id) => {
    const task = byId.get(id)
    if (task === undefined || task.done || task.due === null) return []
    const days = daysBetween(day, task.due)
    const kind: TaskReminderKind = days > 0 ? 'evening-before' : days === 0 ? 'morning-of' : 'overdue'
    return [taskKey(kind, task.id, task.due)]
  })
}

/**
 * Forgets fired keys that can never fire again: tasks that are gone, done or re-dated, and
 * summaries from earlier days. Keeps the list small without re-firing anything still pending.
 */
export function pruneFired(fired: readonly string[], tasks: readonly Task[], now: Date): string[] {
  const today = todayISO(now)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return fired.filter((key) => {
    if (key.startsWith(SUMMARY_KEY_PREFIX)) return key.slice(SUMMARY_KEY_PREFIX.length, SUMMARY_KEY_PREFIX.length + 10) >= today
    const [, id, due] = key.split(':')
    const task = id === undefined ? undefined : byId.get(id)
    return task !== undefined && !task.done && task.due === due
  })
}

/** The next local morning/evening boundary strictly after `now`; a good moment to re-check. */
export function nextReminderCheck(now: Date, settings: ReminderSettings): Date {
  const hours = [
    clampHour(settings.morningHour, DEFAULT_REMINDER_SETTINGS.morningHour),
    clampHour(settings.eveningHour, DEFAULT_REMINDER_SETTINGS.eveningHour),
  ]
  const today = todayISO(now)
  // Today's and tomorrow's boundaries always include one after `now` (tomorrow's is always later).
  const candidates = [0, 1].flatMap((offset) => {
    const day = fromISODate(addDays(today, offset))
    return hours.map((h) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h))
  })
  const upcoming = candidates.filter((c) => c.getTime() > now.getTime()).sort((a, b) => a.getTime() - b.getTime())
  return upcoming[0] ?? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, hours[0])
}
