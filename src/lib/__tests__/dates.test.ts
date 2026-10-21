import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  formatDue,
  fromISODate,
  horizonForDue,
  nearerHorizon,
  parseDateToken,
  toISODate,
  todayISO,
} from '../dates'
import { NOW } from './areas'

describe('toISODate / fromISODate', () => {
  it('zero-pads month and day', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('uses local calendar fields, ignoring time of day', () => {
    expect(toISODate(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31')
  })

  it('fromISODate returns local midnight', () => {
    const d = fromISODate('2026-11-03')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 3, 0, 0])
  })

  it('round-trips', () => {
    expect(toISODate(fromISODate('2028-02-29'))).toBe('2028-02-29')
  })
})

describe('addDays', () => {
  it.each([
    ['2026-10-21', 1, '2026-10-22'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-10-21', 0, '2026-10-21'],
    ['2026-10-21', 365, '2027-10-21'],
    ['2026-03-07', 2, '2026-03-09'], // across US spring-forward
    ['2026-11-01', 1, '2026-11-02'], // across US fall-back
  ])('addDays(%s, %i) = %s', (iso, n, expected) => {
    expect(addDays(iso, n)).toBe(expected)
  })
})

describe('daysBetween', () => {
  it('is zero for the same day', () => {
    expect(daysBetween('2026-10-21', '2026-10-21')).toBe(0)
  })
  it('is positive going forward and negative going back', () => {
    expect(daysBetween('2026-10-21', '2026-10-28')).toBe(7)
    expect(daysBetween('2026-10-28', '2026-10-21')).toBe(-7)
  })
  it('is an integer across DST changes', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
  })
})

describe('todayISO', () => {
  it('formats now as a local date', () => {
    expect(todayISO(NOW)).toBe('2026-10-21')
    expect(todayISO(new Date(2026, 9, 21, 23, 59, 59))).toBe('2026-10-21')
    expect(todayISO(new Date(2026, 9, 21, 0, 0, 1))).toBe('2026-10-21')
  })
})

// NOW is Wednesday 2026-10-21.
describe('parseDateToken: relative words', () => {
  it.each([
    ['today', '2026-10-21', 'today'],
    ['Call mom tonight', '2026-10-21', 'tonight'],
    ['Email mentee tomorrow', '2026-10-22', 'tomorrow'],
    ['tmrw gym', '2026-10-22', 'tmrw'],
    ['TOMORROW', '2026-10-22', 'TOMORROW'],
    ['in 3 days', '2026-10-24', 'in 3 days'],
    ['in 1 day', '2026-10-22', 'in 1 day'],
    ['pay rent in 2 weeks', '2026-11-04', 'in 2 weeks'],
    ['end of month', '2026-10-31', 'end of month'],
    ['report end of the month', '2026-10-31', 'end of the month'],
    ['eom', '2026-10-31', 'eom'],
    ['next week', '2026-10-26', 'next week'],
  ])('%s', (text, due, match) => {
    expect(parseDateToken(text, NOW)).toEqual({ due, match })
  })

  it('"end of month" on the last day of the month is today', () => {
    expect(parseDateToken('eom', new Date(2026, 9, 31))?.due).toBe('2026-10-31')
  })

  it('"next week" on a Monday is the following Monday', () => {
    expect(parseDateToken('next week', new Date(2026, 9, 19))?.due).toBe('2026-10-26')
  })
})

describe('parseDateToken: weekdays', () => {
  it.each([
    ['fri', '2026-10-23'],
    ['Friday', '2026-10-23'],
    ['thu', '2026-10-22'],
    ['sat', '2026-10-24'],
    ['sun', '2026-10-25'],
    ['monday', '2026-10-26'],
    ['tues', '2026-10-27'],
  ])('%s -> next occurrence', (text, due) => {
    expect(parseDateToken(text, NOW)?.due).toBe(due)
  })

  it('a weekday name on that same weekday means today', () => {
    expect(parseDateToken('wed', NOW)?.due).toBe('2026-10-21')
    expect(parseDateToken('Wednesday', NOW)?.due).toBe('2026-10-21')
  })

  // "next <weekday>" is that weekday in the FOLLOWING calendar week (Mon-Sun).
  it.each([
    ['next monday', '2026-10-26'],
    ['next wednesday', '2026-10-28'],
    ['next friday', '2026-10-30'],
    ['next sun', '2026-11-01'],
  ])('%s is in the following calendar week', (text, due) => {
    expect(parseDateToken(text, NOW)).toEqual({ due, match: text })
  })

  it('"next friday" on a Sunday is the Friday of the coming week', () => {
    expect(parseDateToken('next friday', new Date(2026, 9, 25))?.due).toBe('2026-10-30')
  })
})

describe('parseDateToken: month and day', () => {
  it.each([
    ['nov 3', '2026-11-03', 'nov 3'],
    ['November 3', '2026-11-03', 'November 3'],
    ['3 nov', '2026-11-03', '3 nov'],
    ['Nov 3rd', '2026-11-03', 'Nov 3rd'],
    ['due sept 25', '2026-09-25', 'due sept 25'],
    ['nov 3, 2027', '2027-11-03', 'nov 3, 2027'],
    ['dec 25 2026', '2026-12-25', 'dec 25 2026'],
    ['may 5', '2027-05-05', 'may 5'],
  ])('%s', (text, due, match) => {
    expect(parseDateToken(text, NOW)).toEqual({ due, match })
  })

  it('keeps recent past dates (overdue) in the same year', () => {
    expect(parseDateToken('oct 1', NOW)?.due).toBe('2026-10-01')
    expect(parseDateToken('sep 21', NOW)?.due).toBe('2026-09-21') // exactly 30 days ago
  })

  it('rolls to next year when more than 30 days in the past', () => {
    expect(parseDateToken('sep 20', NOW)?.due).toBe('2027-09-20')
    expect(parseDateToken('jan 5', NOW)?.due).toBe('2027-01-05')
  })

  it('does not roll an explicit year', () => {
    expect(parseDateToken('jan 5 2026', NOW)?.due).toBe('2026-01-05')
  })

  it('rejects impossible dates', () => {
    expect(parseDateToken('feb 30', NOW)).toBeNull()
    expect(parseDateToken('13/45', NOW)).toBeNull()
    expect(parseDateToken('2026-02-30', NOW)).toBeNull()
  })
})

describe('parseDateToken: numeric and ISO', () => {
  it.each([
    ['11/3', '2026-11-03', '11/3'],
    ['11/3/2026', '2026-11-03', '11/3/2026'],
    ['11/3/27', '2027-11-03', '11/3/27'],
    ['2026-11-03', '2026-11-03', '2026-11-03'],
    ['due:2026-11-03', '2026-11-03', 'due:2026-11-03'],
    ['due 11/3', '2026-11-03', 'due 11/3'],
    ['Due: friday', '2026-10-23', 'Due: friday'],
    ['submit by fri', '2026-10-23', 'fri'],
  ])('%s', (text, due, match) => {
    expect(parseDateToken(text, NOW)).toEqual({ due, match })
  })
})

describe('parseDateToken: first match wins', () => {
  it('picks the earliest phrase in the text', () => {
    expect(parseDateToken('buy milk fri and nov 3', NOW)).toEqual({ due: '2026-10-23', match: 'fri' })
    expect(parseDateToken('nov 3 or friday', NOW)).toEqual({ due: '2026-11-03', match: 'nov 3' })
  })

  it('prefers the longer phrase at the same position', () => {
    expect(parseDateToken('next friday', NOW)?.match).toBe('next friday')
  })

  it('returns the exact matched substring from the middle of text', () => {
    const text = 'Email the dean tomorrow about housing'
    const hit = parseDateToken(text, NOW)
    expect(hit && text.replace(hit.match, '')).toBe('Email the dean  about housing')
  })
})

describe('parseDateToken: false positives', () => {
  it.each([
    '',
    'nothing to see here',
    'Mondays are hard',
    'summon the team',
    'satisfy the requirement',
    'sunny outlook',
    'tomorrowland tickets',
    'Finish CS303 homework',
    'Study for MA252',
    'Take CS50 course',
    'PH 222 lab',
    'I may need help',
    'may',
    'May I ask',
    'Publish the 2 online games I made',
    'Apply for housing lottery as soon as its out',
    'Plan ACM events for the semester',
    'meet at 10:30',
    'Wednesdays',
    "Make slides for Thursday's board meeting",
    'Prep for Friday’s demo',
    'monkey business',
    'decide on the plan',
    'marching band',
    '#fri',
  ])('%j -> null', (text) => {
    expect(parseDateToken(text, NOW)).toBeNull()
  })
})

describe('horizonForDue', () => {
  it.each([
    [null, null],
    ['2026-10-01', 'today'],
    ['2026-10-20', 'today'],
    ['2026-10-21', 'today'],
    ['2026-10-22', 'week'],
    ['2026-10-28', 'week'],
    ['2026-10-29', 'month'],
    ['2026-11-21', 'month'],
    ['2026-11-22', null],
    ['2027-06-01', null],
  ] as const)('%s -> %s', (due, horizon) => {
    expect(horizonForDue(due, NOW)).toBe(horizon)
  })
})

describe('nearerHorizon', () => {
  it('returns the nearer of two horizons', () => {
    expect(nearerHorizon('week', 'today')).toBe('today')
    expect(nearerHorizon('today', 'month')).toBe('today')
    expect(nearerHorizon('later', 'week')).toBe('week')
    expect(nearerHorizon('someday', 'later')).toBe('later')
  })
  it('keeps the first when the second is null or equal', () => {
    expect(nearerHorizon('week', null)).toBe('week')
    expect(nearerHorizon('month', 'month')).toBe('month')
  })
})

describe('formatDue', () => {
  it.each([
    ['2026-10-21', 'Today'],
    ['2026-10-22', 'Tomorrow'],
    ['2026-10-20', 'Yesterday'],
    ['2026-10-19', '2 days ago'],
    ['2026-10-18', '3 days ago'],
    ['2026-10-23', 'Fri'],
    ['2026-10-27', 'Tue'],
    ['2026-10-28', 'Oct 28'],
    ['2026-11-03', 'Nov 3'],
    ['2027-11-03', 'Nov 3, 2027'],
    ['2026-09-11', 'Sep 11'],
  ])('%s -> %s', (due, label) => {
    expect(formatDue(due, NOW)).toBe(label)
  })
})
