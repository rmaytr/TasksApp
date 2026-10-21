import { describe, expect, it } from 'vitest'
import type { Task } from '../../model/types'
import { blockersOf, dependents, orderTasks, upNext, urgencyScore, wouldCreateCycle } from '../order'
import { makeTask, NOW } from './fixtures'

// NOW is Wednesday 2026-10-21.
const TODAY = '2026-10-21'
const TOMORROW = '2026-10-22'

const ids = (tasks: readonly { id: string }[]): string[] => tasks.map((t) => t.id)
const orderIds = (tasks: readonly Task[]): string[] => orderTasks(tasks, NOW).map((i) => i.task.id)

describe('urgencyScore: due dates', () => {
  it.each([
    // [due, expected score for a normal, medium task whose own ring is `later`]
    ['2026-10-18', 106], // 3 days overdue: 100 + 2*3
    ['2026-10-20', 102], // 1 day overdue
    ['2026-10-21', 80], // today
    ['2026-10-22', 60], // tomorrow
    ['2026-10-23', 50], // 2 days out: start of the 7-day band
    ['2026-10-28', 30], // 7 days out: end of the band
    ['2026-10-29', 20], // 8 days out: start of the month band
    ['2026-11-21', 15], // 31 days out: due term 10, but the month ring (15) is larger
    ['2026-11-22', 5], // 32 days out: no due pressure, just the `later` ring (5)
  ])('due %s scores %d', (due, expected) => {
    expect(urgencyScore(makeTask('a', { due }), NOW)).toBeCloseTo(expected, 6)
  })

  it('caps the extra overdue bonus at 20', () => {
    const wayOverdue = urgencyScore(makeTask('a', { due: '2026-01-01' }), NOW)
    expect(wayOverdue).toBe(120)
  })

  it('decreases monotonically as the due date moves away', () => {
    const scores = Array.from({ length: 45 }, (_, i) => {
      const d = new Date(2026, 9, 21 + i)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return urgencyScore(makeTask('a', { due: iso }), NOW)
    })
    for (let i = 1; i < scores.length; i++) expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!)
  })
})

describe('urgencyScore: rings, priority, effort, waiting, progress', () => {
  it.each([
    ['today', 50],
    ['week', 30],
    ['month', 15],
    ['later', 5],
    ['someday', 0],
  ] as const)('ring %s without a due date scores %d', (horizon, expected) => {
    expect(urgencyScore(makeTask('a', { horizon }), NOW)).toBe(expected)
  })

  it('uses the larger of the due term and the ring term, not their sum', () => {
    // due today = 80, ring today = 50 -> 80 (not 130)
    expect(urgencyScore(makeTask('a', { due: TODAY, horizon: 'today' }), NOW)).toBe(80)
    // 20 days out: due term ~13.5, but the user pinned it to "today" (50)
    expect(urgencyScore(makeTask('a', { due: '2026-11-10', horizon: 'today' }), NOW)).toBe(50)
  })

  it('adds +25 for high and -15 for low priority', () => {
    const base = urgencyScore(makeTask('a', { due: TODAY }), NOW)
    expect(urgencyScore(makeTask('a', { due: TODAY, high: true }), NOW)).toBe(base + 25)
    expect(urgencyScore(makeTask('a', { due: TODAY, low: true }), NOW)).toBe(base - 15)
  })

  it('favours quick wins and penalises big tasks', () => {
    const base = urgencyScore(makeTask('a', { due: TODAY }), NOW)
    expect(urgencyScore(makeTask('a', { due: TODAY, effort: 's' }), NOW)).toBe(base + 6)
    expect(urgencyScore(makeTask('a', { due: TODAY, effort: 'l' }), NOW)).toBe(base - 4)
  })

  it('subtracts 30 when waiting on someone', () => {
    const base = urgencyScore(makeTask('a', { due: TODAY }), NOW)
    expect(urgencyScore(makeTask('a', { due: TODAY, waiting: 'reply from Sam' }), NOW)).toBe(base - 30)
  })

  it('adds +8 momentum only for partially finished steps', () => {
    const steps = (flags: boolean[]): Task['steps'] => flags.map((done, i) => ({ id: `s${i}`, title: `s${i}`, done }))
    const base = urgencyScore(makeTask('a', { due: TODAY }), NOW)
    expect(urgencyScore(makeTask('a', { due: TODAY, steps: steps([true, false]) }), NOW)).toBe(base + 8)
    expect(urgencyScore(makeTask('a', { due: TODAY, steps: steps([false, false]) }), NOW)).toBe(base)
    expect(urgencyScore(makeTask('a', { due: TODAY, steps: steps([true, true]) }), NOW)).toBe(base)
  })

  it('is deterministic for the same inputs', () => {
    const t = makeTask('a', { due: '2026-11-03', high: true, effort: 's' })
    expect(urgencyScore(t, NOW)).toBe(urgencyScore(t, new Date(NOW.getTime())))
  })

  it('depends on the calendar day, not the time of day', () => {
    const t = makeTask('a', { due: TOMORROW })
    expect(urgencyScore(t, new Date(2026, 9, 21, 0, 1))).toBe(urgencyScore(t, new Date(2026, 9, 21, 23, 59)))
  })
})

describe('blockersOf', () => {
  it('returns open existing tasks referenced in after, in order', () => {
    const a = makeTask('a')
    const b = makeTask('b')
    const c = makeTask('c', { after: ['b', 'a'] })
    const byId = new Map([a, b, c].map((t) => [t.id, t]))
    expect(ids(blockersOf(c, byId))).toEqual(['b', 'a'])
  })

  it('ignores done blockers, unknown ids, self-references and duplicates', () => {
    const done = makeTask('d', { done: true })
    const open = makeTask('o')
    const t = makeTask('t', { after: ['d', 'ghost', 't', 'o', 'o'] })
    const byId = new Map([done, open, t].map((x) => [x.id, x]))
    expect(ids(blockersOf(t, byId))).toEqual(['o'])
  })

  it('returns nothing when after is missing or empty', () => {
    const t = makeTask('t')
    expect(blockersOf(t, new Map([[t.id, t]]))).toEqual([])
    expect(blockersOf({ ...t, after: [] }, new Map([[t.id, t]]))).toEqual([])
  })
})

describe('orderTasks: scoring order', () => {
  it('puts overdue before due tomorrow', () => {
    const tomorrow = makeTask('tomorrow', { due: TOMORROW })
    const overdue = makeTask('overdue', { due: '2026-10-19' })
    expect(orderIds([tomorrow, overdue])).toEqual(['overdue', 'tomorrow'])
  })

  it('puts high priority before normal at the same due date', () => {
    const normal = makeTask('normal', { due: TOMORROW })
    const high = makeTask('high', { due: TOMORROW, high: true })
    const low = makeTask('low', { due: TOMORROW, low: true })
    expect(orderIds([low, normal, high])).toEqual(['high', 'normal', 'low'])
  })

  it('breaks otherwise-equal ties in favour of quick wins', () => {
    const big = makeTask('big', { due: TOMORROW, effort: 'l' })
    const medium = makeTask('medium', { due: TOMORROW, effort: 'm' })
    const quick = makeTask('quick', { due: TOMORROW, effort: 's' })
    expect(orderIds([big, medium, quick])).toEqual(['quick', 'medium', 'big'])
  })

  it('breaks equal scores by earlier due date (no due last), then createdAt', () => {
    // Both score 30: week ring (30) vs due in 7 days (30, ring week 30).
    const noDue = makeTask('noDue', { horizon: 'week', createdAt: 1 })
    const dated = makeTask('dated', { horizon: 'week', due: '2026-10-28', createdAt: 9 })
    expect(urgencyScore(noDue, NOW)).toBe(urgencyScore(dated, NOW))
    expect(orderIds([noDue, dated])).toEqual(['dated', 'noDue'])

    const older = makeTask('older', { createdAt: 1 })
    const newer = makeTask('newer', { createdAt: 2 })
    expect(orderIds([newer, older])).toEqual(['older', 'newer'])
  })

  it('ranks a waiting task below an equivalent actionable one', () => {
    const waiting = makeTask('waiting', { due: TODAY, waiting: 'landlord' })
    const free = makeTask('free', { due: TODAY })
    expect(orderIds([waiting, free])).toEqual(['free', 'waiting'])
  })

  it('returns open tasks only, each with its score', () => {
    const open = makeTask('open', { due: TODAY })
    const done = makeTask('done', { done: true, due: TODAY })
    const items = orderTasks([done, open], NOW)
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({ task: open, score: urgencyScore(open, NOW), blockedBy: [] })
  })

  it('handles an empty list', () => {
    expect(orderTasks([], NOW)).toEqual([])
  })

  it('does not mutate its input', () => {
    const tasks = [makeTask('b', { due: TOMORROW }), makeTask('a', { due: TODAY })]
    const snapshot = JSON.stringify(tasks)
    orderTasks(tasks, NOW)
    expect(JSON.stringify(tasks)).toBe(snapshot)
    expect(ids(tasks)).toEqual(['b', 'a'])
  })
})

describe('orderTasks: dependencies', () => {
  it('places a blocked task right after its blocker even if it scores higher', () => {
    const blocker = makeTask('blocker', { low: true }) // score 5 - 15 = -10
    const eager = makeTask('eager', { due: '2026-10-19', high: true, after: ['blocker'] })
    const mid1 = makeTask('mid1', { due: TOMORROW })
    const mid2 = makeTask('mid2', { due: TODAY })
    const items = orderTasks([eager, blocker, mid1, mid2], NOW)
    expect(ids(items.map((i) => i.task))).toEqual(['mid2', 'mid1', 'blocker', 'eager'])
    expect(items[3]!.blockedBy.map((t) => t.id)).toEqual(['blocker'])
    expect(items[2]!.blockedBy).toEqual([])
  })

  it('orders a chain A -> B -> C regardless of scores', () => {
    const a = makeTask('A', { low: true })
    const b = makeTask('B', { due: TOMORROW, after: ['A'] })
    const c = makeTask('C', { due: TODAY, high: true, after: ['B'] })
    const free = makeTask('F', { due: TOMORROW })
    expect(orderIds([c, b, a, free])).toEqual(['F', 'A', 'B', 'C'])
  })

  it('orders a diamond: A, then B and C by score, then D', () => {
    const a = makeTask('A', { low: true })
    const b = makeTask('B', { due: TOMORROW, after: ['A'] })
    const c = makeTask('C', { due: TODAY, after: ['A'] })
    const d = makeTask('D', { due: '2026-10-19', high: true, after: ['B', 'C'] })
    const items = orderTasks([d, c, b, a], NOW)
    expect(ids(items.map((i) => i.task))).toEqual(['A', 'C', 'B', 'D'])
    expect(items[3]!.blockedBy.map((t) => t.id)).toEqual(['B', 'C'])
  })

  it('lets done blockers stop blocking', () => {
    const done = makeTask('done', { done: true })
    const t = makeTask('t', { due: TODAY, after: ['done'] })
    const other = makeTask('other', { due: TOMORROW })
    const items = orderTasks([t, other, done], NOW)
    expect(ids(items.map((i) => i.task))).toEqual(['t', 'other'])
    expect(items[0]!.blockedBy).toEqual([])
  })

  it('ignores unknown ids in after', () => {
    const t = makeTask('t', { after: ['ghost'] })
    const items = orderTasks([t], NOW)
    expect(items).toHaveLength(1)
    expect(items[0]!.blockedBy).toEqual([])
  })

  it('ignores a task that lists itself in after', () => {
    const t = makeTask('t', { after: ['t'] })
    const items = orderTasks([t], NOW)
    expect(ids(items.map((i) => i.task))).toEqual(['t'])
    expect(items[0]!.blockedBy).toEqual([])
  })

  it('breaks a 2-cycle at the highest-scoring task and keeps both', () => {
    const a = makeTask('A', { due: TODAY, after: ['B'] })
    const b = makeTask('B', { due: TOMORROW, after: ['A'] })
    const free = makeTask('F', { due: TODAY, low: true })
    const items = orderTasks([b, a, free], NOW)
    // A (80) is released from the loop and outranks F (65); B (60) follows A but ranks below F.
    expect(ids(items.map((i) => i.task))).toEqual(['A', 'F', 'B'])
    expect(items.find((i) => i.task.id === 'A')!.blockedBy).toEqual([])
    expect(items.find((i) => i.task.id === 'B')!.blockedBy.map((t) => t.id)).toEqual(['A'])
  })

  it('breaks a 3-cycle at its highest-scoring task and keeps all tasks', () => {
    // A after C, B after A, C after B. B scores highest.
    const a = makeTask('A', { after: ['C'] })
    const b = makeTask('B', { due: TODAY, high: true, after: ['A'] })
    const c = makeTask('C', { after: ['B'] })
    const items = orderTasks([a, b, c], NOW)
    expect(ids(items.map((i) => i.task))).toEqual(['B', 'C', 'A'])
  })

  it('breaks the cycle, not tasks merely downstream of it', () => {
    // D waits on the A<->B cycle and scores highest overall; it must not be chosen as the cycle breaker.
    const a = makeTask('A', { due: TOMORROW, after: ['B'] })
    const b = makeTask('B', { due: TODAY, after: ['A'] })
    const d = makeTask('D', { due: '2026-10-10', high: true, after: ['A'] })
    expect(orderIds([d, a, b])).toEqual(['B', 'A', 'D'])
  })

  it('handles several independent cycles and a full-cycle input', () => {
    const tasks = [
      makeTask('A', { after: ['B'] }),
      makeTask('B', { after: ['A'] }),
      makeTask('C', { after: ['D'] }),
      makeTask('D', { after: ['E'] }),
      makeTask('E', { after: ['C'] }),
    ]
    const out = orderIds(tasks)
    expect([...out].sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('terminates on a long cycle', () => {
    const n = 300
    const tasks = Array.from({ length: n }, (_, i) => makeTask(`t${i}`, { after: [`t${(i + 1) % n}`] }))
    expect(orderIds(tasks)).toHaveLength(n)
  })

  it('treats a cycle through a done task as no cycle', () => {
    const a = makeTask('A', { after: ['B'] })
    const b = makeTask('B', { done: true, after: ['A'] })
    expect(orderTasks([a, b], NOW).map((i) => [i.task.id, i.blockedBy.length])).toEqual([['A', 0]])
  })
})

describe('orderTasks: determinism and performance', () => {
  it('gives the same order regardless of input order', () => {
    const tasks = [
      makeTask('a', { due: TOMORROW }),
      makeTask('b', { due: TOMORROW }),
      makeTask('c', { due: TOMORROW }),
      makeTask('d', { due: TODAY, after: ['a'] }),
      makeTask('e', { after: ['f'] }),
      makeTask('f', { after: ['e'] }),
    ]
    const expected = orderIds(tasks)
    expect(orderIds([...tasks].reverse())).toEqual(expected)
    expect(orderIds([tasks[3]!, tasks[0]!, tasks[5]!, tasks[1]!, tasks[4]!, tasks[2]!])).toEqual(expected)
    expect(orderIds(tasks)).toEqual(expected)
  })

  function randomTasks(count: number, withEdges: boolean): Task[] {
    let seed = 12345
    const rand = (): number => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296
      return seed / 4_294_967_296
    }
    const efforts = ['s', 'm', 'l'] as const
    return Array.from({ length: count }, (_, i) => {
      const after: string[] = []
      if (withEdges && rand() < 0.5) after.push(`t${Math.floor(rand() * count)}`)
      if (withEdges && rand() < 0.2) after.push(`t${Math.floor(rand() * count)}`)
      const dueOffset = Math.floor(rand() * 90) - 10
      const d = new Date(2026, 9, 21 + dueOffset)
      return makeTask(`t${i}`, {
        due: rand() < 0.7 ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null,
        high: rand() < 0.2,
        low: rand() > 0.85,
        effort: efforts[Math.floor(rand() * 3)]!,
        waiting: rand() < 0.1 ? 'someone' : null,
        createdAt: i,
        after,
      })
    })
  }

  it('orders 500 random tasks (with arbitrary, possibly cyclic dependencies) fast', () => {
    const tasks = randomTasks(500, true)
    orderTasks(tasks.slice(0, 50), NOW) // warm up the JIT
    const start = performance.now()
    const items = orderTasks(tasks, NOW)
    const elapsed = performance.now() - start
    // Typically ~10 ms; the generous bound only catches accidental quadratic work, not a busy CI box.
    expect(elapsed).toBeLessThan(250)
    expect(new Set(ids(items.map((i) => i.task))).size).toBe(500)
  })

  it('never places a task before its open blockers when there are no cycles', () => {
    const tasks = randomTasks(500, false).map((t, i) => (i > 0 && i % 3 === 0 ? { ...t, after: [`t${i - 1}`, `t${(i * 7) % i}`] } : t))
    const position = new Map(orderIds(tasks).map((id, i) => [id, i]))
    for (const t of tasks) for (const dep of t.after ?? []) expect(position.get(dep)!).toBeLessThan(position.get(t.id)!)
  })
})

describe('upNext', () => {
  it('returns null when nothing is open', () => {
    expect(upNext([], NOW)).toBeNull()
    expect(upNext([makeTask('a', { done: true })], NOW)).toBeNull()
  })

  it('returns the top-scoring unblocked task', () => {
    const a = makeTask('a', { due: TOMORROW })
    const b = makeTask('b', { due: TODAY })
    expect(upNext([a, b], NOW)?.id).toBe('b')
  })

  it('skips blocked tasks, even high-scoring ones', () => {
    const blocker = makeTask('blocker', { low: true })
    const eager = makeTask('eager', { due: '2026-10-19', high: true, after: ['blocker'] })
    expect(upNext([eager, blocker], NOW)?.id).toBe('blocker')
  })

  it('skips tasks that are waiting on someone', () => {
    const waiting = makeTask('waiting', { due: '2026-10-19', waiting: 'a reply' })
    const free = makeTask('free', { horizon: 'someday' })
    expect(upNext([waiting, free], NOW)?.id).toBe('free')
  })

  it('falls back to the first item when everything is waiting or blocked', () => {
    const a = makeTask('a', { due: TODAY, waiting: 'x' })
    const b = makeTask('b', { due: TOMORROW, waiting: 'y' })
    expect(upNext([b, a], NOW)?.id).toBe('a')
  })

  it('still returns a task when everything sits in a dependency cycle', () => {
    const a = makeTask('a', { after: ['b'] })
    const b = makeTask('b', { after: ['a'] })
    expect(upNext([a, b], NOW)).not.toBeNull()
  })
})

describe('wouldCreateCycle', () => {
  const a = makeTask('A')
  const b = makeTask('B', { after: ['A'] })
  const c = makeTask('C', { after: ['B'] })

  it('is true for a self-dependency', () => {
    expect(wouldCreateCycle([a], 'A', 'A')).toBe(true)
  })

  it('is true for a direct reverse edge', () => {
    expect(wouldCreateCycle([a, b], 'A', 'B')).toBe(true)
  })

  it('is true for a transitive cycle', () => {
    expect(wouldCreateCycle([a, b, c], 'A', 'C')).toBe(true)
  })

  it('is false for a harmless new edge', () => {
    expect(wouldCreateCycle([a, b, c], 'C', 'A')).toBe(false)
    expect(wouldCreateCycle([a, b, makeTask('X')], 'X', 'C')).toBe(false)
  })

  it('is false when an edge merely repeats an existing one', () => {
    expect(wouldCreateCycle([a, b], 'B', 'A')).toBe(false)
  })

  it('ignores unknown ids and tolerates existing cycles elsewhere', () => {
    const x = makeTask('X', { after: ['Y'] })
    const y = makeTask('Y', { after: ['X'] })
    expect(wouldCreateCycle([a, x, y], 'A', 'ghost')).toBe(false)
    expect(wouldCreateCycle([a, x, y], 'A', 'X')).toBe(false)
  })

  it('also counts paths through done tasks, so reopening cannot create a loop', () => {
    const done = makeTask('M', { done: true, after: ['A'] })
    const z = makeTask('Z', { after: ['M'] })
    expect(wouldCreateCycle([a, done, z], 'A', 'Z')).toBe(true)
  })
})

describe('dependents', () => {
  it('returns open tasks whose after includes the id', () => {
    const a = makeTask('A')
    const b = makeTask('B', { after: ['A'] })
    const c = makeTask('C', { after: ['X', 'A'] })
    const d = makeTask('D', { after: ['A'], done: true })
    const e = makeTask('E', { after: ['B'] })
    expect(ids(dependents([a, b, c, d, e], 'A'))).toEqual(['B', 'C'])
  })

  it('returns an empty list when nothing depends on the task', () => {
    expect(dependents([makeTask('A'), makeTask('B')], 'A')).toEqual([])
    expect(dependents([], 'A')).toEqual([])
  })
})
