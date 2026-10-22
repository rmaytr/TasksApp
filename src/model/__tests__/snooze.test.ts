import { describe, expect, it } from 'vitest'
import { NOW, makeTask } from '../../plan/__tests__/fixtures'
import { snooze } from '../snooze'

// NOW is Wednesday 2026-10-21.
describe('snooze', () => {
  it.each([
    ['2026-10-21', '2026-10-22', 'Snoozed to Tomorrow'],
    ['2026-10-18', '2026-10-22', 'Snoozed to Tomorrow'],
    ['2026-10-23', '2026-10-24', 'Snoozed to Sat, Oct 24'],
  ])('a task due %s moves to %s', (due, next, label) => {
    expect(snooze(makeTask('a', { due }), NOW)).toEqual({ patch: { due: next }, label })
  })

  it.each([
    ['today', 'week', 'Snoozed to This week'],
    ['week', 'month', 'Snoozed to This month'],
    ['later', 'someday', 'Snoozed to Someday'],
    ['someday', 'someday', 'Snoozed to Someday'],
  ] as const)('an undated task in %s moves to %s', (horizon, next, label) => {
    expect(snooze(makeTask('a', { horizon }), NOW)).toEqual({ patch: { horizon: next }, label })
  })
})
