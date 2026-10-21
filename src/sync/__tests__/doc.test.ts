import { describe, expect, it } from 'vitest'
import { TOMBSTONE_TTL_MS, parseSyncDoc, pruneTombstones } from '../doc'
import { makeArea, makeDoc, makeTask } from './fixtures'

const EMPTY = { v: 1, areas: [], tasks: [], tombstones: [] }

describe('parseSyncDoc', () => {
  it('round-trips a valid document, keeping area.updatedAt and task.repeat', () => {
    const doc = makeDoc({
      areas: [makeArea('a1', { updatedAt: 55 })],
      tasks: [makeTask('t1', { repeat: 'weekly' })],
      tombstones: [{ id: 'x', kind: 'task', at: 9 }],
    })
    expect(parseSyncDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
  })

  it.each([null, undefined, 42, 'str', [], true])('returns an empty doc for %j', (raw) => {
    expect(parseSyncDoc(raw)).toEqual(EMPTY)
  })

  it('returns an empty doc for an unknown version', () => {
    expect(parseSyncDoc({ ...makeDoc(), v: 2 })).toEqual(EMPTY)
  })

  it('returns an empty doc when the version is missing', () => {
    expect(parseSyncDoc({ areas: [makeArea('a1')], tasks: [], tombstones: [] })).toEqual(EMPTY)
  })

  it('treats non-array collections as empty', () => {
    expect(parseSyncDoc({ v: 1, areas: 'x', tasks: {}, tombstones: 5 })).toEqual(EMPTY)
  })

  it('drops invalid items individually', () => {
    const doc = parseSyncDoc({
      v: 1,
      areas: [makeArea('a1'), { id: 5 }, null],
      tasks: [makeTask('t1'), { id: 't2' }, 'junk', makeTask('t3', { updatedAt: 'x' as never })],
      tombstones: [
        { id: 'a', kind: 'task', at: 1 },
        { id: 'b', kind: 'nope', at: 1 },
        { id: 'c', kind: 'area' },
      ],
    })
    expect(doc.areas.map((a) => a.id)).toEqual(['a1'])
    expect(doc.tasks.map((t) => t.id)).toEqual(['t1'])
    expect(doc.tombstones).toEqual([{ id: 'a', kind: 'task', at: 1 }])
  })

  it('repairs recoverable fields with defaults, like the local store schema', () => {
    const raw = { ...makeTask('t1'), horizon: 'bogus', effort: 'xl', steps: 'nope', due: 'tomorrow' }
    const [task] = parseSyncDoc({ v: 1, areas: [], tasks: [raw], tombstones: [] }).tasks
    expect(task).toMatchObject({ horizon: 'later', effort: 'm', steps: [], due: null })
  })

  it('ignores an invalid repeat and an invalid area updatedAt instead of dropping the item', () => {
    const doc = parseSyncDoc({
      v: 1,
      areas: [{ ...makeArea('a1'), updatedAt: 'later' }],
      tasks: [{ ...makeTask('t1'), repeat: 'hourly' }],
      tombstones: [],
    })
    expect(doc.areas).toHaveLength(1)
    expect(doc.areas[0].updatedAt).toBeUndefined()
    expect(doc.tasks).toHaveLength(1)
    expect(doc.tasks[0].repeat).toBeUndefined()
  })

  it('does not add repeat or updatedAt keys when absent', () => {
    const doc = parseSyncDoc(makeDoc({ tasks: [makeTask('t1')] }))
    expect('repeat' in doc.tasks[0]).toBe(false)
    expect('updatedAt' in doc.areas[0]).toBe(false)
  })

  it('strips unknown fields', () => {
    const doc = parseSyncDoc({ v: 1, areas: [{ ...makeArea('a1'), evil: 1 }], tasks: [], tombstones: [] })
    expect('evil' in doc.areas[0]).toBe(false)
  })

  it('keeps only the newest copy of an id that appears twice', () => {
    const doc = parseSyncDoc({
      v: 1,
      areas: [],
      tasks: [makeTask('t1', { title: 'old', updatedAt: 1 }), makeTask('t1', { title: 'new', updatedAt: 2 })],
      tombstones: [],
    })
    expect(doc.tasks).toHaveLength(1)
    expect(doc.tasks[0].title).toBe('new')
  })

  it('handles unicode and emoji content', () => {
    const doc = parseSyncDoc(makeDoc({ tasks: [makeTask('t1', { title: 'Купить молоко 🥛' })] }))
    expect(doc.tasks[0].title).toBe('Купить молоко 🥛')
  })
})

describe('pruneTombstones', () => {
  const now = 10 * TOMBSTONE_TTL_MS

  it('has a 90 day TTL', () => {
    expect(TOMBSTONE_TTL_MS).toBe(90 * 86_400_000)
  })

  it('drops tombstones older than the TTL and keeps newer ones', () => {
    const old = { id: 'old', kind: 'task' as const, at: now - TOMBSTONE_TTL_MS - 1 }
    const fresh = { id: 'new', kind: 'task' as const, at: now - 1000 }
    expect(pruneTombstones([old, fresh], now)).toEqual([fresh])
  })

  it('keeps a tombstone exactly at the TTL boundary', () => {
    const edge = { id: 'edge', kind: 'area' as const, at: now - TOMBSTONE_TTL_MS }
    expect(pruneTombstones([edge], now)).toEqual([edge])
  })

  it('does not mutate its input and handles empty input', () => {
    const input = [{ id: 'old', kind: 'task' as const, at: 0 }]
    pruneTombstones(input, now)
    expect(input).toHaveLength(1)
    expect(pruneTombstones([], now)).toEqual([])
  })
})
