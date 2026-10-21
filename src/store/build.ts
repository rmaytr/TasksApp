import { horizonForDue } from '../lib/dates'
import { newId } from '../lib/ids'
import type { Horizon, Step, Task, TaskDraft } from '../model/types'

const clip = (s: string, max: number): string => s.trim().slice(0, max)

export function buildSteps(steps: TaskDraft['steps']): Step[] {
  return (steps ?? [])
    .map((s) => ({ id: newId(), title: clip(s.title, 300), done: Boolean(s.done) }))
    .filter((s) => s.title.length > 0)
}

/** Turns a parsed draft into a full task. `fallbackHorizon` applies when neither ring nor due date is given. */
export function draftToTask(draft: TaskDraft, areaId: string, now: Date, fallbackHorizon: Horizon): Task {
  const due = draft.due ?? null
  const done = Boolean(draft.done)
  const time = now.getTime()
  return {
    id: newId(),
    title: clip(draft.title, 300) || 'Untitled',
    notes: clip(draft.notes ?? '', 5000),
    areaId,
    horizon: draft.horizon ?? horizonForDue(due, now) ?? fallbackHorizon,
    due,
    high: Boolean(draft.high),
    ...(draft.low && !draft.high && { low: true }),
    effort: draft.effort ?? 'm',
    waiting: draft.waiting?.trim() || null,
    plan: draft.plan?.trim() || null,
    steps: buildSteps(draft.steps),
    done,
    doneAt: done ? time : null,
    createdAt: time,
    updatedAt: time,
    spentMinutes: 0,
  }
}
