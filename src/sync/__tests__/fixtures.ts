import type { Area, Task } from '../../model/types'
import type { SyncDoc } from '../doc'

export function makeArea(id: string, overrides: Partial<Area> = {}): Area {
  return { id, name: `Area ${id}`, color: 'indigo', ...overrides }
}

export function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    notes: '',
    areaId: 'a1',
    horizon: 'later',
    due: null,
    high: false,
    effort: 'm',
    waiting: null,
    plan: null,
    steps: [],
    done: false,
    doneAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    spentMinutes: 0,
    ...overrides,
  }
}

export function makeDoc(overrides: Partial<SyncDoc> = {}): SyncDoc {
  return { v: 1, areas: [makeArea('a1')], tasks: [], tombstones: [], ...overrides }
}
