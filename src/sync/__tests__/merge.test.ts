import { describe, expect, it } from 'vitest'
import type { SyncDoc } from '../doc'
import { TOMBSTONE_TTL_MS } from '../doc'
import { docsEqual, mergeDocs } from '../merge'
import { makeArea, makeDoc, makeTask } from './fixtures'

const NOW = 1_000_000

function byId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id))
}

/** Content equality that ignores array order, for commutativity checks. */
function content(doc: SyncDoc): unknown {
  return {
    areas: byId(doc.areas),
    tasks: byId(doc.tasks),
    tombstones: [...doc.tombstones].sort((a, b) => `${a.kind}${a.id}`.localeCompare(`${b.kind}${b.id}`)),
  }
}

describe('mergeDocs: last writer wins', () => {
  it('keeps the newer edit of a task regardless of side', () => {
    const older = makeDoc({ tasks: [makeTask('t1', { title: 'old', updatedAt: 10 })] })
    const newer = makeDoc({ tasks: [makeTask('t1', { title: 'new', updatedAt: 20 })] })
    expect(mergeDocs(older, newer, NOW).tasks[0].title).toBe('new')
    expect(mergeDocs(newer, older, NOW).tasks[0].title).toBe('new')
  })

  it('keeps the newer edit of an area, treating a missing updatedAt as 0', () => {
    const legacy = makeDoc({ areas: [makeArea('a1', { name: 'legacy' })] })
    const edited = makeDoc({ areas: [makeArea('a1', { name: 'edited', updatedAt: 5 })] })
    expect(mergeDocs(legacy, edited, NOW).areas[0].name).toBe('edited')
    expect(mergeDocs(edited, legacy, NOW).areas[0].name).toBe('edited')
  })

  it('prefers remote on an exact updatedAt tie (deterministic across devices)', () => {
    const local = makeDoc({ tasks: [makeTask('t1', { title: 'local', updatedAt: 10 })] })
    const remote = makeDoc({ tasks: [makeTask('t1', { title: 'remote', updatedAt: 10 })] })
    expect(mergeDocs(local, remote, NOW).tasks[0].title).toBe('remote')
  })

  it('prefers remote on an area tie with both updatedAt missing', () => {
    const local = makeDoc({ areas: [makeArea('a1', { name: 'local' })] })
    const remote = makeDoc({ areas: [makeArea('a1', { name: 'remote' })] })
    expect(mergeDocs(local, remote, NOW).areas[0].name).toBe('remote')
  })

  it('unions new items created on both sides', () => {
    const local = makeDoc({ tasks: [makeTask('l1')], areas: [makeArea('a1'), makeArea('la')] })
    const remote = makeDoc({ tasks: [makeTask('r1')], areas: [makeArea('a1'), makeArea('ra')] })
    const merged = mergeDocs(local, remote, NOW)
    expect(merged.tasks.map((t) => t.id)).toEqual(['l1', 'r1'])
    expect(merged.areas.map((a) => a.id)).toEqual(['a1', 'la', 'ra'])
  })

  it('keeps local order first, then appends remote-only items in remote order', () => {
    const local = makeDoc({ tasks: [makeTask('c'), makeTask('a')] })
    const remote = makeDoc({ tasks: [makeTask('z'), makeTask('a'), makeTask('b')] })
    expect(mergeDocs(local, remote, NOW).tasks.map((t) => t.id)).toEqual(['c', 'a', 'z', 'b'])
  })

  it('merges edits to different tasks made on two devices', () => {
    const base = [makeTask('t1', { updatedAt: 1 }), makeTask('t2', { updatedAt: 1 })]
    const a = makeDoc({ tasks: [{ ...base[0], title: 'A edit', updatedAt: 50 }, base[1]] })
    const b = makeDoc({ tasks: [base[0], { ...base[1], title: 'B edit', updatedAt: 60 }] })
    const merged = mergeDocs(a, b, NOW)
    expect(merged.tasks.map((t) => t.title)).toEqual(['A edit', 'B edit'])
  })
})

describe('mergeDocs: tombstones', () => {
  it('removes a task deleted on one side when the other did not touch it', () => {
    const local = makeDoc({ tasks: [], tombstones: [{ id: 't1', kind: 'task', at: 100 }] })
    const remote = makeDoc({ tasks: [makeTask('t1', { updatedAt: 50 })] })
    const merged = mergeDocs(local, remote, NOW)
    expect(merged.tasks).toEqual([])
    expect(merged.tombstones).toContainEqual({ id: 't1', kind: 'task', at: 100 })
    expect(content(mergeDocs(remote, local, NOW))).toEqual(content(merged))
  })

  it('keeps a task edited after its tombstone and drops that tombstone', () => {
    const local = makeDoc({ tombstones: [{ id: 't1', kind: 'task', at: 100 }] })
    const remote = makeDoc({ tasks: [makeTask('t1', { updatedAt: 200 })] })
    for (const merged of [mergeDocs(local, remote, NOW), mergeDocs(remote, local, NOW)]) {
      expect(merged.tasks.map((t) => t.id)).toEqual(['t1'])
      expect(merged.tombstones).toEqual([])
    }
  })

  it('removes the item when the tombstone is exactly as new as the item', () => {
    const local = makeDoc({ tombstones: [{ id: 't1', kind: 'task', at: 100 }] })
    const remote = makeDoc({ tasks: [makeTask('t1', { updatedAt: 100 })] })
    expect(mergeDocs(local, remote, NOW).tasks).toEqual([])
  })

  it('keeps the newest tombstone per id and kind', () => {
    const local = makeDoc({ tombstones: [{ id: 'x', kind: 'task', at: 100 }] })
    const remote = makeDoc({
      tombstones: [
        { id: 'x', kind: 'task', at: 300 },
        { id: 'x', kind: 'area', at: 50 },
      ],
    })
    const merged = mergeDocs(local, remote, NOW)
    expect(merged.tombstones).toHaveLength(2)
    expect(merged.tombstones).toContainEqual({ id: 'x', kind: 'task', at: 300 })
    expect(merged.tombstones).toContainEqual({ id: 'x', kind: 'area', at: 50 })
  })

  it('does not let a task tombstone remove an area with the same id', () => {
    const local = makeDoc({ areas: [makeArea('a1'), makeArea('same')], tombstones: [{ id: 'same', kind: 'task', at: 999 }] })
    expect(mergeDocs(local, makeDoc(), NOW).areas.map((a) => a.id)).toEqual(['a1', 'same'])
  })

  it('prunes tombstones older than the TTL', () => {
    const now = 10 * TOMBSTONE_TTL_MS
    const local = makeDoc({
      tombstones: [
        { id: 'old', kind: 'task', at: now - TOMBSTONE_TTL_MS - 1 },
        { id: 'fresh', kind: 'task', at: now - 10 },
      ],
    })
    const merged = mergeDocs(local, makeDoc(), now)
    expect(merged.tombstones.map((t) => t.id)).toEqual(['fresh'])
  })
})

describe('mergeDocs: areas and re-homing', () => {
  it('re-homes tasks of a deleted area to the first remaining area', () => {
    const local = makeDoc({
      areas: [makeArea('a1'), makeArea('a2')],
      tasks: [makeTask('t1', { areaId: 'a2', updatedAt: 10 })],
      tombstones: [],
    })
    const remote = makeDoc({
      areas: [makeArea('a1')],
      tasks: [],
      tombstones: [{ id: 'a2', kind: 'area', at: 500 }],
    })
    const merged = mergeDocs(local, remote, NOW)
    expect(merged.areas.map((a) => a.id)).toEqual(['a1'])
    expect(merged.tasks).toHaveLength(1)
    expect(merged.tasks[0]).toMatchObject({ id: 't1', areaId: 'a1', updatedAt: 10 })
  })

  it('re-homes tasks whose area never existed', () => {
    const local = makeDoc({ tasks: [makeTask('t1', { areaId: 'ghost' })] })
    expect(mergeDocs(local, makeDoc(), NOW).tasks[0].areaId).toBe('a1')
  })

  it('uses the merged area order to choose the re-home target', () => {
    const local = makeDoc({
      areas: [makeArea('first'), makeArea('second'), makeArea('gone')],
      tasks: [makeTask('t1', { areaId: 'gone' })],
    })
    const remote = makeDoc({ areas: [makeArea('first'), makeArea('second')], tombstones: [{ id: 'gone', kind: 'area', at: 9_999 }] })
    expect(mergeDocs(local, remote, NOW).tasks[0].areaId).toBe('first')
  })

  it('never returns zero areas when an input had areas, even if all were tombstoned', () => {
    const local = makeDoc({ areas: [makeArea('a1', { updatedAt: 5 })], tasks: [makeTask('t1')] })
    const remote = makeDoc({
      areas: [],
      tasks: [],
      tombstones: [{ id: 'a1', kind: 'area', at: 100 }],
    })
    for (const merged of [mergeDocs(local, remote, NOW), mergeDocs(remote, local, NOW)]) {
      expect(merged.areas.map((a) => a.id)).toEqual(['a1'])
      expect(merged.tasks.map((t) => t.areaId)).toEqual(['a1'])
      expect(merged.tombstones.filter((t) => t.kind === 'area')).toEqual([])
    }
  })

  it('restored areas survive a second merge with the tombstoning side', () => {
    const local = makeDoc({ areas: [makeArea('a1', { updatedAt: 5 })] })
    const remote = makeDoc({ areas: [], tombstones: [{ id: 'a1', kind: 'area', at: 100 }] })
    const restored = mergeDocs(local, remote, NOW)
    expect(mergeDocs(restored, remote, NOW).areas.map((a) => a.id)).toEqual(['a1'])
  })

  it('returns zero areas only when neither input had any', () => {
    const empty = makeDoc({ areas: [] })
    expect(mergeDocs(empty, empty, NOW).areas).toEqual([])
  })

  it('keeps tasks (without crashing) when there are no areas at all', () => {
    const empty = makeDoc({ areas: [], tasks: [makeTask('t1', { areaId: 'x' })] })
    expect(mergeDocs(empty, makeDoc({ areas: [] }), NOW).tasks[0].areaId).toBe('x')
  })
})

describe('mergeDocs: algebraic properties', () => {
  const a = makeDoc({
    areas: [makeArea('a1', { updatedAt: 3 }), makeArea('a2', { name: 'A side', updatedAt: 9 })],
    tasks: [
      makeTask('t1', { title: 'a1', updatedAt: 10 }),
      makeTask('t2', { areaId: 'a2', updatedAt: 30 }),
      makeTask('t3', { updatedAt: 40 }),
    ],
    tombstones: [{ id: 't9', kind: 'task', at: 77 }],
  })
  const b = makeDoc({
    areas: [makeArea('a1', { name: 'B side', updatedAt: 8 })],
    tasks: [
      makeTask('t1', { title: 'b1', updatedAt: 20 }),
      makeTask('t3', { updatedAt: 41, title: 'b3' }),
      makeTask('t4', { updatedAt: 5 }),
      makeTask('t9', { updatedAt: 70 }),
    ],
    tombstones: [{ id: 't2', kind: 'task', at: 31 }],
  })

  it('is idempotent: merge(x, x) equals x', () => {
    expect(mergeDocs(a, a, NOW)).toEqual(a)
    expect(mergeDocs(b, b, NOW)).toEqual(b)
  })

  it('is idempotent on its own result', () => {
    const m = mergeDocs(a, b, NOW)
    expect(mergeDocs(m, b, NOW)).toEqual(m)
    expect(mergeDocs(a, m, NOW)).toEqual(m)
    expect(mergeDocs(m, m, NOW)).toEqual(m)
  })

  it('is commutative in content (order may differ)', () => {
    expect(content(mergeDocs(a, b, NOW))).toEqual(content(mergeDocs(b, a, NOW)))
  })

  it('applies both tombstones in the combined result', () => {
    const merged = mergeDocs(a, b, NOW)
    expect(merged.tasks.map((t) => t.id).sort()).toEqual(['t1', 't3', 't4'])
    expect(merged.tasks.find((t) => t.id === 't3')?.title).toBe('b3')
    expect(merged.tasks.find((t) => t.id === 't1')?.title).toBe('b1')
  })

  it('is associative in content across three devices', () => {
    const c = makeDoc({ tasks: [makeTask('t5'), makeTask('t4', { updatedAt: 6, title: 'c4' })] })
    const left = mergeDocs(mergeDocs(a, b, NOW), c, NOW)
    const right = mergeDocs(a, mergeDocs(b, c, NOW), NOW)
    expect(content(left)).toEqual(content(right))
  })

  it('does not mutate its inputs', () => {
    const snapshot = JSON.stringify([a, b])
    mergeDocs(a, b, NOW)
    expect(JSON.stringify([a, b])).toBe(snapshot)
  })

  it('handles 10k tasks', () => {
    const many = (prefix: string): SyncDoc =>
      makeDoc({ tasks: Array.from({ length: 10_000 }, (_, i) => makeTask(`${prefix}${i}`)) })
    expect(mergeDocs(many('l'), many('r'), NOW).tasks).toHaveLength(20_000)
  })
})

describe('docsEqual', () => {
  it('is true for identical documents', () => {
    expect(docsEqual(makeDoc({ tasks: [makeTask('t1')] }), makeDoc({ tasks: [makeTask('t1')] }))).toBe(true)
  })

  it('ignores tombstone order', () => {
    const t1 = { id: 'a', kind: 'task' as const, at: 1 }
    const t2 = { id: 'b', kind: 'area' as const, at: 2 }
    expect(docsEqual(makeDoc({ tombstones: [t1, t2] }), makeDoc({ tombstones: [t2, t1] }))).toBe(true)
  })

  it('ignores object key order', () => {
    const task = makeTask('t1')
    const reordered = Object.fromEntries(Object.entries(task).reverse()) as typeof task
    expect(docsEqual(makeDoc({ tasks: [task] }), makeDoc({ tasks: [reordered] }))).toBe(true)
  })

  it('ignores task and area order so devices with different orderings do not ping-pong', () => {
    const a = makeDoc({ areas: [makeArea('a1'), makeArea('a2')], tasks: [makeTask('t1'), makeTask('t2')] })
    const b = makeDoc({ areas: [makeArea('a2'), makeArea('a1')], tasks: [makeTask('t2'), makeTask('t1')] })
    expect(docsEqual(a, b)).toBe(true)
  })

  it('detects a changed field', () => {
    const a = makeDoc({ tasks: [makeTask('t1')] })
    const b = makeDoc({ tasks: [makeTask('t1', { title: 'changed' })] })
    expect(docsEqual(a, b)).toBe(false)
  })

  it('detects added items, tombstones and differing tombstone times', () => {
    const base = makeDoc()
    expect(docsEqual(base, makeDoc({ tasks: [makeTask('t1')] }))).toBe(false)
    expect(docsEqual(base, makeDoc({ tombstones: [{ id: 'x', kind: 'task', at: 1 }] }))).toBe(false)
    expect(
      docsEqual(
        makeDoc({ tombstones: [{ id: 'x', kind: 'task', at: 1 }] }),
        makeDoc({ tombstones: [{ id: 'x', kind: 'task', at: 2 }] }),
      ),
    ).toBe(false)
  })

  it('distinguishes a present optional field from an absent one', () => {
    const a = makeDoc({ tasks: [makeTask('t1')] })
    const b = makeDoc({ tasks: [makeTask('t1', { repeat: 'daily' })] })
    expect(docsEqual(a, b)).toBe(false)
  })
})
