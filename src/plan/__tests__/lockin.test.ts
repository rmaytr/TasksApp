import { describe, expect, it } from 'vitest'
import { localPlan, localReason, mergeAssistantPlan, pinnedPlan } from '../lockin'
import { NOW, makeTask } from './fixtures'

describe('localPlan', () => {
  it('puts tasks you can start now ahead of ones waiting on something', () => {
    const tasks = [
      makeTask('waiting', { due: '2026-10-21', waiting: 'Sam' }),
      makeTask('blocked', { due: '2026-10-21', after: ['first'] }),
      makeTask('first', { due: '2026-10-25' }),
      makeTask('free'),
    ]
    const { ids, source } = localPlan(tasks, NOW)
    expect(source).toBe('local')
    expect(ids.indexOf('first')).toBeLessThan(ids.indexOf('blocked'))
    expect(ids.indexOf('free')).toBeLessThan(ids.indexOf('waiting'))
    expect(ids.slice(-2).sort()).toEqual(['blocked', 'waiting'])
  })

  it('leaves done tasks out', () => {
    expect(localPlan([makeTask('a', { done: true }), makeTask('b')], NOW).ids).toEqual(['b'])
  })
})

describe('localReason', () => {
  it.each([
    [{ due: '2026-10-19' }, /passed/],
    [{ due: '2026-10-21' }, /due today/],
    [{ due: '2026-10-22' }, /due tomorrow/],
    [{ high: true }, /high priority/],
    [{ due: '2026-10-26' }, /this week/],
  ])('%o', (overrides, pattern) => {
    expect(localReason(makeTask('x', overrides), [], NOW)).toMatch(pattern)
  })

  it('mentions tasks that wait on this one', () => {
    const tasks = [makeTask('x'), makeTask('y', { after: ['x'] })]
    expect(localReason(tasks[0]!, tasks, NOW)).toBe('Another task waits on this one.')
  })

  it('says nothing when there is no particular reason', () => {
    expect(localReason(makeTask('x'), [], NOW)).toBeNull()
  })
})

describe('mergeAssistantPlan', () => {
  it('follows the assistant, drops unknown or done ids, and appends what it skipped', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c', { done: true }), makeTask('d', { high: true })]
    const plan = mergeAssistantPlan(
      [
        { taskId: 'b', reason: 'Quick win first.' },
        { taskId: 'ghost', reason: 'x' },
        { taskId: 'c', reason: 'done already' },
        { taskId: 'b', reason: 'duplicate' },
      ],
      '  Start small. ',
      tasks,
      NOW,
    )
    expect(plan.ids[0]).toBe('b')
    expect(plan.ids.sort()).toEqual(['a', 'b', 'd'])
    expect(plan.reasons.b).toBe('Quick win first.')
    expect(plan.reasons.d).toMatch(/high priority/)
    expect(plan.summary).toBe('Start small.')
    expect(plan.source).toBe('assistant')
  })
})

describe('pinnedPlan', () => {
  it('starts with the chosen task', () => {
    const tasks = [makeTask('a', { due: '2026-10-21' }), makeTask('b')]
    expect(pinnedPlan('b', tasks, NOW).ids).toEqual(['b', 'a'])
  })
})
