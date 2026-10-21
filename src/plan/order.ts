import { daysBetween, todayISO } from '../lib/dates'
import { effectiveHorizon } from '../model/derive'
import type { Horizon, Task } from '../model/types'

/* -------------------------------------------------------------------------- */
/* Urgency score                                                              */
/* -------------------------------------------------------------------------- */
/**
 * score = max(dueTerm, ringTerm) + priorityTerm + effortTerm + waitingTerm + momentumTerm
 *
 * dueTerm (calendar days until due, local; none when there is no due date = 0)
 *   overdue          100 + 2 per day overdue, the extra capped at +20  (102 .. 120)
 *   today            80
 *   tomorrow         60
 *   2..7 days        50 -> 30, linear (-4 per day)
 *   8..31 days       20 -> 10, linear
 *   later            0
 * ringTerm (effectiveHorizon: the user's ring, pulled in by an approaching due date)
 *   today 50, week 30, month 15, later 5, someday 0
 * priorityTerm   high +25, normal 0, low -15
 * effortTerm     quick (s) +6, medium 0, big (l) -4
 * waitingTerm    -30 when the task is waiting on someone/something
 * momentumTerm   +8 when some, but not all, steps are done
 *
 * The due and ring terms are combined with max (not sum) so a task is never
 * counted twice for the same urgency.
 */

const OVERDUE_BASE = 100
const OVERDUE_PER_DAY = 2
const OVERDUE_EXTRA_CAP = 20
const DUE_TODAY = 80
const DUE_TOMORROW = 60
const WEEK_BAND_FIRST_DAY = 2
const WEEK_BAND_LAST_DAY = 7
const WEEK_BAND_START = 50
const WEEK_BAND_END = 30
const MONTH_BAND_LAST_DAY = 31
const MONTH_BAND_START = 20
const MONTH_BAND_END = 10

const RING_SCORE: Record<Horizon, number> = { today: 50, week: 30, month: 15, later: 5, someday: 0 }
const HIGH_PRIORITY_BONUS = 25
const LOW_PRIORITY_PENALTY = 15
const QUICK_WIN_BONUS = 6
const BIG_TASK_PENALTY = 4
const WAITING_PENALTY = 30
const MOMENTUM_BONUS = 8

/** Linear interpolation from `from` at `first` to `to` at `last`, for `day` in [first, last]. */
function interpolate(day: number, first: number, last: number, from: number, to: number): number {
  return from + ((to - from) * (day - first)) / (last - first)
}

function dueTerm(due: string | null, now: Date): number {
  if (due === null) return 0
  const days = daysBetween(todayISO(now), due)
  if (days < 0) return OVERDUE_BASE + Math.min(OVERDUE_EXTRA_CAP, -days * OVERDUE_PER_DAY)
  if (days === 0) return DUE_TODAY
  if (days === 1) return DUE_TOMORROW
  if (days <= WEEK_BAND_LAST_DAY) {
    return interpolate(days, WEEK_BAND_FIRST_DAY, WEEK_BAND_LAST_DAY, WEEK_BAND_START, WEEK_BAND_END)
  }
  if (days <= MONTH_BAND_LAST_DAY) {
    return interpolate(days, WEEK_BAND_LAST_DAY + 1, MONTH_BAND_LAST_DAY, MONTH_BAND_START, MONTH_BAND_END)
  }
  return 0
}

function hasPartialProgress(task: Task): boolean {
  const doneSteps = task.steps.filter((s) => s.done).length
  return doneSteps > 0 && doneSteps < task.steps.length
}

/** Higher = do sooner. Pure and deterministic for a given (task, calendar day). */
export function urgencyScore(task: Task, now: Date): number {
  const base = Math.max(dueTerm(task.due, now), RING_SCORE[effectiveHorizon(task, now)])
  const priority = task.high ? HIGH_PRIORITY_BONUS : task.low ? -LOW_PRIORITY_PENALTY : 0
  const effort = task.effort === 's' ? QUICK_WIN_BONUS : task.effort === 'l' ? -BIG_TASK_PENALTY : 0
  const waiting = task.waiting ? -WAITING_PENALTY : 0
  const momentum = hasPartialProgress(task) ? MOMENTUM_BONUS : 0
  return base + priority + effort + waiting + momentum
}

/* -------------------------------------------------------------------------- */
/* Dependencies                                                               */
/* -------------------------------------------------------------------------- */

/** Open, existing tasks that `task` must wait for (done, unknown, duplicate and self ids are ignored). */
export function blockersOf(task: Task, byId: ReadonlyMap<string, Task>): Task[] {
  const seen = new Set<string>()
  const blockers: Task[] = []
  for (const id of task.after ?? []) {
    if (id === task.id || seen.has(id)) continue
    seen.add(id)
    const blocker = byId.get(id)
    if (blocker !== undefined && !blocker.done) blockers.push(blocker)
  }
  return blockers
}

/** Open tasks that are waiting for `taskId`. */
export function dependents(tasks: readonly Task[], taskId: string): Task[] {
  return tasks.filter((t) => !t.done && (t.after ?? []).includes(taskId))
}

/**
 * Would "taskId comes after afterId" create a loop? True when afterId is taskId
 * or already (transitively) depends on it. Every task counts, including done ones,
 * so reopening a finished task can never close a loop.
 */
export function wouldCreateCycle(tasks: readonly Task[], taskId: string, afterId: string): boolean {
  if (taskId === afterId) return true
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const visited = new Set<string>()
  const pending = [afterId]
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (id === taskId) return true
    if (visited.has(id)) continue
    visited.add(id)
    pending.push(...(byId.get(id)?.after ?? []))
  }
  return false
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

export interface PlanItem {
  task: Task
  score: number
  /** Open tasks that come before this one because it must wait for them (empty = ready to start). */
  blockedBy: Task[]
}

type Compare = (a: string, b: string) => number
type BlockerMap = ReadonlyMap<string, readonly string[]>

/** Binary min-heap by `compare`; `pop` returns the item that sorts first. Local mutable state only. */
function createHeap(compare: Compare): { push: (id: string) => void; pop: () => string | undefined } {
  const items: string[] = []
  const swap = (i: number, j: number): void => {
    const tmp = items[i] as string
    items[i] = items[j] as string
    items[j] = tmp
  }
  const before = (i: number, j: number): boolean => compare(items[i] as string, items[j] as string) < 0
  return {
    push(id) {
      items.push(id)
      for (let i = items.length - 1; i > 0; ) {
        const parent = (i - 1) >> 1
        if (!before(i, parent)) break
        swap(i, parent)
        i = parent
      }
    },
    pop() {
      const top = items[0]
      const last = items.pop()
      if (top === undefined || last === undefined) return top
      if (items.length === 0) return top
      items[0] = last
      for (let i = 0; ; ) {
        const left = 2 * i + 1
        const right = left + 1
        let smallest = i
        if (left < items.length && before(left, smallest)) smallest = left
        if (right < items.length && before(right, smallest)) smallest = right
        if (smallest === i) break
        swap(i, smallest)
        i = smallest
      }
      return top
    },
  }
}

/** For each id, the ids that wait for it (reverse of the blocker map). */
function waitersOf(ids: readonly string[], blockers: BlockerMap): Map<string, string[]> {
  const waiters = new Map<string, string[]>()
  for (const id of ids) {
    for (const blocker of blockers.get(id) ?? []) {
      const list = waiters.get(blocker)
      if (list === undefined) waiters.set(blocker, [id])
      else list.push(id)
    }
  }
  return waiters
}

/** Ids that cannot be placed by a plain topological peel, i.e. in or downstream of a cycle. */
function unplaceable(ids: readonly string[], blockers: BlockerMap): Set<string> {
  const waiting = new Map(ids.map((id) => [id, blockers.get(id)?.length ?? 0]))
  const blocking = waitersOf(ids, blockers)
  const ready = ids.filter((id) => waiting.get(id) === 0)
  for (let id = ready.pop(); id !== undefined; id = ready.pop()) {
    waiting.delete(id)
    for (const dep of blocking.get(id) ?? []) {
      const left = (waiting.get(dep) ?? 0) - 1
      waiting.set(dep, left)
      if (left === 0) ready.push(dep)
    }
  }
  return new Set(waiting.keys())
}

/** A cycle reachable by walking blockers from the best-ranked stuck task, as `[x, blocker(x), ...]`. */
function findCycle(stuck: ReadonlySet<string>, ranked: readonly string[], blockers: BlockerMap): string[] {
  const rank = new Map(ranked.map((id, i) => [id, i]))
  const byRank = (a: string, b: string): number => (rank.get(a) ?? 0) - (rank.get(b) ?? 0)
  const path: string[] = []
  const position = new Map<string, number>()
  for (let cur: string | undefined = ranked.find((id) => stuck.has(id)); cur !== undefined; ) {
    const seenAt = position.get(cur)
    if (seenAt !== undefined) return path.slice(seenAt)
    position.set(cur, path.length)
    path.push(cur)
    cur = (blockers.get(cur) ?? []).filter((b) => stuck.has(b)).sort(byRank)[0]
  }
  return path
}

/**
 * Removes just enough "after" edges to make the graph acyclic. For each cycle found
 * the edge into its highest-ranked task (the wait on its in-cycle blocker) is ignored.
 */
function breakCycles(ranked: readonly string[], blockers: BlockerMap): BlockerMap {
  let current = blockers
  for (let stuck = unplaceable(ranked, current); stuck.size > 0; stuck = unplaceable(ranked, current)) {
    const cycle = findCycle(stuck, ranked, current)
    const rank = new Map(ranked.map((id, i) => [id, i]))
    const best = cycle.reduce((a, b) => ((rank.get(b) ?? 0) < (rank.get(a) ?? 0) ? b : a))
    const bestAt = cycle.indexOf(best)
    const blocker = cycle[(bestAt + 1) % cycle.length] as string
    current = new Map(current).set(
      best,
      (current.get(best) ?? []).filter((id) => id !== blocker),
    )
  }
  return current
}

function compareDue(a: Task, b: Task): number {
  return (a.due ?? '9999-99-99').localeCompare(b.due ?? '9999-99-99')
}

/**
 * The plan: open tasks only. Ready tasks come by score (ties: earlier due, then createdAt,
 * then id so the result never depends on input order). A task that waits for others is
 * placed after all of its open blockers, positioned by its own score among the tasks
 * available at that point (Kahn's algorithm with a score-ordered heap). Dependency
 * loops are broken at the highest-scoring task of each loop; no task is ever dropped.
 */
export function orderTasks(tasks: readonly Task[], now: Date): PlanItem[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const open = tasks.filter((t) => !t.done)
  const scores = new Map(open.map((t) => [t.id, urgencyScore(t, now)]))
  const score = (id: string): number => scores.get(id) ?? 0
  const task = (id: string): Task => byId.get(id) as Task

  const compare: Compare = (a, b) =>
    score(b) - score(a) || compareDue(task(a), task(b)) || task(a).createdAt - task(b).createdAt || a.localeCompare(b)
  const ranked = open.map((t) => t.id).sort(compare)

  const rawBlockers = new Map(open.map((t) => [t.id, blockersOf(t, byId).map((b) => b.id)]))
  const blockers = breakCycles(ranked, rawBlockers)

  const waitingOn = new Map(ranked.map((id) => [id, blockers.get(id)?.length ?? 0]))
  const blocking = waitersOf(ranked, blockers)

  const heap = createHeap(compare)
  for (const id of ranked) if (waitingOn.get(id) === 0) heap.push(id)

  const plan: PlanItem[] = []
  for (let id = heap.pop(); id !== undefined; id = heap.pop()) {
    plan.push({
      task: task(id),
      score: score(id),
      blockedBy: (blockers.get(id) ?? []).map(task),
    })
    for (const dep of blocking.get(id) ?? []) {
      const left = (waitingOn.get(dep) ?? 0) - 1
      waitingOn.set(dep, left)
      if (left === 0) heap.push(dep)
    }
  }
  return plan
}

/**
 * The single best thing to do now: the first ready (unblocked) task that is not waiting
 * on someone; otherwise simply the first task of the plan. Null when nothing is open.
 */
export function upNext(tasks: readonly Task[], now: Date): Task | null {
  const plan = orderTasks(tasks, now)
  const ready = plan.find((item) => item.blockedBy.length === 0 && !item.task.waiting)
  return (ready ?? plan[0])?.task ?? null
}
