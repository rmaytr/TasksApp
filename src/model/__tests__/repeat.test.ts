import { describe, expect, it } from 'vitest'
import type { Task } from '../types'
import { nextDue, nextOccurrence } from '../repeat'

const NOW = new Date(2026, 9, 21, 12) // Wed 2026-10-21
let n = 0
const id = (): string => `id${++n}`

function task(extra: Partial<Task>): Task {
  return {
    id: 'orig',
    title: 'Weekly reading',
    notes: '',
    areaId: 'classes',
    horizon: 'week',
    due: null,
    high: false,
    effort: 'm',
    waiting: null,
    plan: null,
    steps: [{ id: 's1', title: 'Read', done: true }],
    done: true,
    doneAt: 1,
    createdAt: 1,
    updatedAt: 1,
    spentMinutes: 30,
    ...extra,
  }
}

describe('nextDue', () => {
  it('moves daily and weekly tasks one step past today', () => {
    expect(nextDue('daily', '2026-10-21', '2026-10-21', '2026-10-21')).toBe('2026-10-22')
    expect(nextDue('weekly', '2026-10-23', '2026-10-23', '2026-10-21')).toBe('2026-10-30')
  })

  it('jumps over many missed intervals at once', () => {
    expect(nextDue('weekly', '2026-01-07', '2026-01-07', '2026-10-21')).toBe('2026-10-28')
    expect(nextDue('daily', '0001-01-01', '0001-01-01', '2026-10-21')).toBe('2026-10-22')
  })

  it('keeps month-end anchors instead of drifting to the 28th', () => {
    const anchor = '2026-01-31'
    const feb = nextDue('monthly', anchor, anchor, '2026-01-31')
    expect(feb).toBe('2026-02-28')
    const mar = nextDue('monthly', feb, anchor, '2026-02-28')
    expect(mar).toBe('2026-03-31')
  })

  it('skips months that are already in the past', () => {
    expect(nextDue('monthly', '2026-05-15', '2026-05-15', '2026-10-21')).toBe('2026-11-15')
  })
})

describe('nextOccurrence', () => {
  it('copies the task with fresh ids, unchecked steps and a link to its origin', () => {
    const next = nextOccurrence(task({ repeat: 'weekly', due: '2026-10-21' }), NOW, id)
    expect(next).toMatchObject({ due: '2026-10-28', done: false, spentMinutes: 0, repeatOf: 'orig' })
    expect(next?.steps).toEqual([{ id: expect.any(String), title: 'Read', done: false }])
    expect(next?.id).not.toBe('orig')
  })

  it('returns null for tasks that do not repeat', () => {
    expect(nextOccurrence(task({}), NOW, id)).toBeNull()
  })

  it('carries the monthly anchor forward', () => {
    const next = nextOccurrence(task({ repeat: 'monthly', due: '2026-10-31' }), NOW, id)
    expect(next).toMatchObject({ due: '2026-11-30', repeatAnchor: '2026-10-31' })
  })
})
