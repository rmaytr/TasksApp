import { daysBetween, todayISO } from '../lib/dates'
import { priorityOf, type Task } from '../model/types'
import { dependents, orderTasks } from './order'

/** An ordered queue of task ids for a Lock-in session, with a short "why" for each. */
export interface LockInPlan {
  ids: string[]
  reasons: Record<string, string>
  summary: string | null
  source: 'assistant' | 'local'
}

/** A plain-language reason from the task's own facts, used when the assistant isn't. */
export function localReason(task: Task, tasks: readonly Task[], now: Date): string | null {
  const waitingOnIt = dependents(tasks, task.id).length
  if (task.due) {
    const days = daysBetween(todayISO(now), task.due)
    if (days < 0) return 'Its date has passed, so getting it off your plate comes first.'
    if (days === 0) return 'It’s due today.'
    if (days === 1) return 'It’s due tomorrow.'
  }
  if (waitingOnIt > 0) return `${waitingOnIt === 1 ? 'Another task waits' : `${waitingOnIt} tasks wait`} on this one.`
  if (priorityOf(task) === 'high') return 'You marked it high priority.'
  if (task.due && daysBetween(todayISO(now), task.due) <= 6) return 'It’s due this week.'
  return null
}

/**
 * The local plan: the planner's order, with tasks that can start now (not waiting on another
 * task or on someone) ahead of the ones that can't.
 */
export function localPlan(tasks: readonly Task[], now: Date): LockInPlan {
  const items = orderTasks(tasks, now)
  const ready = items.filter((p) => p.blockedBy.length === 0 && !p.task.waiting)
  const later = items.filter((p) => p.blockedBy.length > 0 || p.task.waiting)
  const ids = [...ready, ...later].map((p) => p.task.id)
  const reasons: Record<string, string> = {}
  for (const p of items) {
    const why = localReason(p.task, tasks, now)
    if (why) reasons[p.task.id] = why
  }
  return { ids, reasons, summary: null, source: 'local' }
}

/**
 * The assistant's order, kept to tasks that still exist and are open, followed by any open
 * task it left out (in local order) so nothing silently disappears.
 */
export function mergeAssistantPlan(
  order: readonly { taskId: string; reason: string }[],
  summary: string | null,
  tasks: readonly Task[],
  now: Date,
): LockInPlan {
  const local = localPlan(tasks, now)
  const open = new Set(tasks.filter((t) => !t.done).map((t) => t.id))
  const seen = new Set<string>()
  const ids: string[] = []
  const reasons: Record<string, string> = { ...local.reasons }
  for (const o of order) {
    if (!open.has(o.taskId) || seen.has(o.taskId)) continue
    seen.add(o.taskId)
    ids.push(o.taskId)
    if (o.reason.trim()) reasons[o.taskId] = o.reason.trim()
  }
  for (const id of local.ids) if (!seen.has(id)) ids.push(id)
  return { ids, reasons, summary: summary?.trim() || null, source: 'assistant' }
}

/** Starts with the chosen task, then everything else in local order. */
export function pinnedPlan(taskId: string, tasks: readonly Task[], now: Date): LockInPlan {
  const local = localPlan(tasks, now)
  return { ...local, ids: [taskId, ...local.ids.filter((id) => id !== taskId)] }
}
