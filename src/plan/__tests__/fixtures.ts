import type { Task } from '../../model/types'

/** Wednesday, 2026-10-21, mid-afternoon local time. */
export const NOW = new Date(2026, 9, 21, 15, 30)

/** A baseline open, normal-priority, medium task; override any field. */
export function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    notes: '',
    areaId: 'life',
    horizon: 'later',
    due: null,
    high: false,
    effort: 'm',
    waiting: null,
    plan: null,
    steps: [],
    done: false,
    doneAt: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    spentMinutes: 0,
    ...overrides,
  }
}
