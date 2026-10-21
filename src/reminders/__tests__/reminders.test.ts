import { describe, expect, it } from 'vitest'
import type { Task } from '../../model/types'
import { makeTask } from '../../plan/__tests__/fixtures'
import {
  DEFAULT_REMINDER_SETTINGS,
  dueReminders,
  headsUp,
  nextReminderCheck,
  pruneFired,
  reminderKeys,
  type ReminderSettings,
} from '../reminders'

// 2026-10-21 is a Wednesday. Local time throughout.
const SETTINGS: ReminderSettings = { morningHour: 8, eveningHour: 20 }
const NONE: ReadonlySet<string> = new Set()
const at = (day: number, hour = 12, minute = 0, month = 9): Date => new Date(2026, month, day, hour, minute)
const ids = (tasks: readonly { id: string }[]): string[] => tasks.map((t) => t.id)
const NOW = at(21, 15, 30)

describe('headsUp', () => {
  it('buckets open dated tasks into overdue / today / tomorrow / soon', () => {
    const tasks = [
      makeTask('old', { due: '2026-10-01' }),
      makeTask('yesterday', { due: '2026-10-20' }),
      makeTask('today', { due: '2026-10-21' }),
      makeTask('tomorrow', { due: '2026-10-22' }),
      makeTask('in2', { due: '2026-10-23' }),
      makeTask('in3', { due: '2026-10-24' }),
      makeTask('in4', { due: '2026-10-25' }),
    ]
    const result = headsUp(tasks, NOW)
    expect(ids(result.overdue)).toEqual(['old', 'yesterday'])
    expect(ids(result.today)).toEqual(['today'])
    expect(ids(result.tomorrow)).toEqual(['tomorrow'])
    expect(ids(result.soon)).toEqual(['in2', 'in3'])
  })

  it('ignores done tasks and tasks without a due date', () => {
    const result = headsUp(
      [makeTask('done', { due: '2026-10-21', done: true }), makeTask('nodue'), makeTask('open', { due: '2026-10-21' })],
      NOW,
    )
    expect(ids(result.today)).toEqual(['open'])
    expect(result.overdue).toEqual([])
    expect(result.tomorrow).toEqual([])
    expect(result.soon).toEqual([])
  })

  it('sorts each list by due date, then priority (high, normal, low)', () => {
    const result = headsUp(
      [
        makeTask('low', { due: '2026-10-21', low: true }),
        makeTask('normal', { due: '2026-10-21' }),
        makeTask('high', { due: '2026-10-21', high: true }),
        makeTask('later', { due: '2026-10-20', low: true }),
        makeTask('earlier', { due: '2026-10-19' }),
        makeTask('earlier2', { due: '2026-10-19', high: true }),
      ],
      NOW,
    )
    expect(ids(result.today)).toEqual(['high', 'normal', 'low'])
    expect(ids(result.overdue)).toEqual(['earlier2', 'earlier', 'later'])
  })

  it('returns empty lists for no tasks and does not mutate input', () => {
    expect(headsUp([], NOW)).toEqual({ overdue: [], today: [], tomorrow: [], soon: [] })
    const tasks = [makeTask('b', { due: '2026-10-22' }), makeTask('a', { due: '2026-10-21' })]
    headsUp(tasks, NOW)
    expect(ids(tasks)).toEqual(['b', 'a'])
  })

  it('uses calendar days regardless of time of day', () => {
    const t = makeTask('t', { due: '2026-10-22' })
    expect(ids(headsUp([t], at(21, 0, 1)).tomorrow)).toEqual(['t'])
    expect(ids(headsUp([t], at(21, 23, 59)).tomorrow)).toEqual(['t'])
    expect(ids(headsUp([t], at(22, 0, 1)).today)).toEqual(['t'])
  })
})

describe('dueReminders: evening-before', () => {
  const task = makeTask('t', { title: 'Pay rent', due: '2026-10-22' })

  it('does not fire before the evening hour on the day before', () => {
    expect(dueReminders([task], at(21, 19, 59), SETTINGS, NONE)).toEqual([])
  })

  it('fires from the evening hour on the day before', () => {
    const [r, ...rest] = dueReminders([task], at(21, 20, 0), SETTINGS, NONE)
    expect(rest).toEqual([])
    expect(r).toEqual({
      key: 'evening-before:t:2026-10-22',
      taskIds: ['t'],
      title: 'Due tomorrow: Pay rent',
      body: '',
      kind: 'evening-before',
    })
    expect(dueReminders([task], at(21, 23, 59), SETTINGS, NONE)).toHaveLength(1)
  })

  it('does not fire two days ahead, even late in the evening', () => {
    expect(dueReminders([task], at(20, 22, 0), SETTINGS, NONE)).toEqual([])
  })

  it('does not fire once the due day has arrived (missed window)', () => {
    const kinds = dueReminders([task], at(22, 23, 0), SETTINGS, NONE).map((r) => r.kind)
    expect(kinds).not.toContain('evening-before')
    expect(kinds).toEqual(['morning-of'])
  })
})

describe('dueReminders: morning-of', () => {
  const task = makeTask('t', { title: 'File taxes', due: '2026-10-21' })

  it('does not fire before the morning hour', () => {
    expect(dueReminders([task], at(21, 7, 59), SETTINGS, NONE)).toEqual([])
  })

  it('fires from the morning hour with friendly copy', () => {
    const [r] = dueReminders([task], at(21, 8, 0), SETTINGS, NONE)
    expect(r).toEqual({
      key: 'morning-of:t:2026-10-21',
      taskIds: ['t'],
      title: 'Today: File taxes',
      body: '',
      kind: 'morning-of',
    })
  })

  it('still fires at 11pm on the due day when the app is opened late', () => {
    expect(dueReminders([task], at(21, 23, 0), SETTINGS, NONE).map((r) => r.kind)).toEqual(['morning-of'])
  })
})

describe('dueReminders: overdue', () => {
  const task = makeTask('t', { title: 'Renew passport', due: '2026-10-20' })

  it('does not fire before the morning hour on the first day after the due date', () => {
    expect(dueReminders([task], at(21, 7, 0), SETTINGS, NONE)).toEqual([])
  })

  it('fires once at/after the morning hour on the first day after', () => {
    const [r, ...rest] = dueReminders([task], at(21, 8, 0), SETTINGS, NONE)
    expect(rest).toEqual([])
    expect(r).toEqual({
      key: 'overdue:t:2026-10-20',
      taskIds: ['t'],
      title: 'Still open: Renew passport',
      body: '',
      kind: 'overdue',
    })
  })

  it('fires on any later day, including long after the due date', () => {
    expect(dueReminders([task], at(25, 9), SETTINGS, NONE).map((r) => r.kind)).toEqual(['overdue'])
    expect(dueReminders([task], at(1, 9, 0, 11), SETTINGS, NONE).map((r) => r.kind)).toEqual(['overdue'])
  })

  it('is once-only: the same key does not re-fire the next day', () => {
    const fired = new Set(['overdue:t:2026-10-20'])
    expect(dueReminders([task], at(22, 9), SETTINGS, fired)).toEqual([])
  })
})

describe('dueReminders: fired keys, re-arming, exclusions', () => {
  it('skips keys that have already fired', () => {
    const t = makeTask('t', { due: '2026-10-21' })
    expect(dueReminders([t], at(21, 9), SETTINGS, new Set(['morning-of:t:2026-10-21']))).toEqual([])
  })

  it('re-arms when the due date moves, because the key includes the date', () => {
    const fired = new Set(['evening-before:t:2026-10-22'])
    const moved = makeTask('t', { due: '2026-10-23' })
    expect(dueReminders([moved], at(22, 21), SETTINGS, fired).map((r) => r.key)).toEqual(['evening-before:t:2026-10-23'])
    const original = makeTask('t', { due: '2026-10-22' })
    expect(dueReminders([original], at(21, 21), SETTINGS, fired)).toEqual([])
  })

  it('ignores done tasks and tasks without a due date', () => {
    const tasks = [makeTask('done', { due: '2026-10-21', done: true }), makeTask('nodue')]
    expect(dueReminders(tasks, at(21, 9), SETTINGS, NONE)).toEqual([])
  })

  it('returns nothing for no tasks', () => {
    expect(dueReminders([], NOW, SETTINGS, NONE)).toEqual([])
  })

  it('does not mutate the fired set or the tasks', () => {
    const fired = new Set<string>()
    const tasks = [makeTask('t', { due: '2026-10-21' })]
    const snapshot = JSON.stringify(tasks)
    dueReminders(tasks, at(21, 9), SETTINGS, fired)
    expect(fired.size).toBe(0)
    expect(JSON.stringify(tasks)).toBe(snapshot)
  })

  it('orders reminders: overdue, then today, then tomorrow', () => {
    const tasks = [
      makeTask('tomorrow', { due: '2026-10-22' }),
      makeTask('today', { due: '2026-10-21' }),
      makeTask('overdue', { due: '2026-10-19' }),
    ]
    const out = dueReminders(tasks, at(21, 21), SETTINGS, NONE)
    expect(out.flatMap((r) => r.taskIds)).toEqual(['overdue', 'today', 'tomorrow'])
  })

  it('orders reminders of the same kind by due date, then priority', () => {
    const tasks = [
      makeTask('low', { due: '2026-10-21', low: true }),
      makeTask('normal', { due: '2026-10-21' }),
      makeTask('high', { due: '2026-10-21', high: true }),
    ]
    const out = dueReminders(tasks, at(21, 9), SETTINGS, NONE)
    expect(out.flatMap((r) => r.taskIds)).toEqual(['high', 'normal', 'low'])
  })
})

describe('dueReminders: body copy', () => {
  const steps = (flags: boolean[]): Task['steps'] => flags.map((done, i) => ({ id: `s${i}`, title: `s${i}`, done }))
  const bodyOf = (t: Task): string => dueReminders([t], at(21, 9), SETTINGS, NONE)[0]!.body

  it('reports step progress when some steps are done', () => {
    expect(bodyOf(makeTask('t', { due: '2026-10-21', steps: steps([true, true, false, false]) }))).toBe('2 of 4 steps done')
  })

  it('says "Quick one" for small tasks without progress', () => {
    expect(bodyOf(makeTask('t', { due: '2026-10-21', effort: 's' }))).toBe('Quick one')
  })

  it('prefers step progress over "Quick one"', () => {
    expect(bodyOf(makeTask('t', { due: '2026-10-21', effort: 's', steps: steps([true, false]) }))).toBe('1 of 2 steps done')
  })

  it('is an empty string otherwise', () => {
    expect(bodyOf(makeTask('t', { due: '2026-10-21' }))).toBe('')
    expect(bodyOf(makeTask('t', { due: '2026-10-21', steps: steps([false, false]) }))).toBe('')
    expect(bodyOf(makeTask('t', { due: '2026-10-21', effort: 'l' }))).toBe('')
  })
})

describe('dueReminders: summaries', () => {
  const four = ['a', 'b', 'c', 'd'].map((id) => makeTask(id, { title: `Task ${id}`, due: '2026-10-21' }))

  it('keeps up to three reminders as individual notifications', () => {
    expect(dueReminders(four.slice(0, 3), at(21, 9), SETTINGS, NONE)).toHaveLength(3)
  })

  it('collapses more than three into one summary', () => {
    const out = dueReminders(four, at(21, 9), SETTINGS, NONE)
    expect(out).toEqual([
      {
        key: 'summary:2026-10-21:morning-of:4',
        taskIds: ['a', 'b', 'c', 'd'],
        title: '4 tasks need attention',
        body: 'Task a, Task b, Task c and 1 more',
        kind: 'summary',
      },
    ])
  })

  it('says "and N more" with the right count', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeTask(id, { title: id, due: '2026-10-21' }))
    const [r] = dueReminders(six, at(21, 9), SETTINGS, NONE)
    expect(r!.title).toBe('6 tasks need attention')
    expect(r!.body).toBe('a, b, c and 3 more')
    expect(r!.key).toBe('summary:2026-10-21:morning-of:6')
  })

  it("uses 'mixed' in the key when kinds differ", () => {
    const mixed = [
      makeTask('a', { due: '2026-10-19' }),
      makeTask('b', { due: '2026-10-20' }),
      makeTask('c', { due: '2026-10-21' }),
      makeTask('d', { due: '2026-10-22' }),
    ]
    const [r] = dueReminders(mixed, at(21, 21), SETTINGS, NONE)
    expect(r!.kind).toBe('summary')
    expect(r!.key).toBe('summary:2026-10-21:mixed:4')
    expect(r!.taskIds).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does not repeat a summary that already fired', () => {
    const fired = new Set(['summary:2026-10-21:morning-of:4'])
    expect(dueReminders(four, at(21, 10), SETTINGS, fired)).toEqual([])
  })

  it('falls back to individual reminders once enough individual keys are marked fired', () => {
    const fired = new Set(['morning-of:a:2026-10-21'])
    expect(dueReminders(four, at(21, 10), SETTINGS, fired).map((r) => r.kind)).toEqual(['morning-of', 'morning-of', 'morning-of'])
  })

  it('counts only reminders that have not fired when deciding to summarise', () => {
    const fired = new Set(['morning-of:a:2026-10-21', 'morning-of:b:2026-10-21'])
    expect(dueReminders(four, at(21, 10), SETTINGS, fired)).toHaveLength(2)
  })
})

describe('reminderKeys', () => {
  it('returns the single key of a normal reminder', () => {
    const t = makeTask('t', { due: '2026-10-21' })
    const [r] = dueReminders([t], at(21, 9), SETTINGS, NONE)
    expect(reminderKeys(r!, [t])).toEqual(['morning-of:t:2026-10-21'])
  })

  it('returns every individual key a summary covers', () => {
    const tasks = [
      makeTask('a', { due: '2026-10-19' }),
      makeTask('b', { due: '2026-10-20' }),
      makeTask('c', { due: '2026-10-21' }),
      makeTask('d', { due: '2026-10-22' }),
    ]
    const [summary] = dueReminders(tasks, at(21, 21), SETTINGS, NONE)
    expect(reminderKeys(summary!, tasks)).toEqual([
      'overdue:a:2026-10-19',
      'overdue:b:2026-10-20',
      'morning-of:c:2026-10-21',
      'evening-before:d:2026-10-22',
    ])
  })

  it('marking a summary and its keys fired silences the next check', () => {
    const tasks = ['a', 'b', 'c', 'd'].map((id) => makeTask(id, { due: '2026-10-21' }))
    const now = at(21, 9)
    const [summary] = dueReminders(tasks, now, SETTINGS, NONE)
    const fired = new Set([summary!.key, ...reminderKeys(summary!, tasks)])
    expect(dueReminders(tasks, at(21, 18), SETTINGS, fired)).toEqual([])
  })

  it('skips tasks that no longer exist or are done', () => {
    const tasks = ['a', 'b', 'c', 'd'].map((id) => makeTask(id, { due: '2026-10-21' }))
    const [summary] = dueReminders(tasks, at(21, 9), SETTINGS, NONE)
    const remaining = [tasks[0]!, { ...tasks[1]!, done: true }, tasks[3]!]
    expect(reminderKeys(summary!, remaining)).toEqual(['morning-of:a:2026-10-21', 'morning-of:d:2026-10-21'])
  })

  it('returns nothing for a summary whose key cannot be read', () => {
    expect(
      reminderKeys({ key: 'summary:garbage', taskIds: ['a'], title: '', body: '', kind: 'summary' }, [makeTask('a', { due: '2026-10-21' })]),
    ).toEqual([])
  })
})

describe('nextReminderCheck', () => {
  it('is this morning when before the morning hour', () => {
    expect(nextReminderCheck(at(21, 6, 15), SETTINGS)).toEqual(at(21, 8))
  })

  it('is this evening when between the two hours', () => {
    expect(nextReminderCheck(at(21, 8, 0, 9), SETTINGS)).toEqual(at(21, 20))
    expect(nextReminderCheck(at(21, 15, 30), SETTINGS)).toEqual(at(21, 20))
  })

  it("is tomorrow's morning after the evening hour", () => {
    expect(nextReminderCheck(at(21, 20, 0), SETTINGS)).toEqual(at(22, 8))
    expect(nextReminderCheck(at(21, 23, 59), SETTINGS)).toEqual(at(22, 8))
  })

  it('is strictly after now, even exactly on a boundary', () => {
    const now = at(21, 8, 0)
    expect(nextReminderCheck(now, SETTINGS).getTime()).toBeGreaterThan(now.getTime())
  })

  it('works when the evening hour is earlier than the morning hour', () => {
    const odd: ReminderSettings = { morningHour: 18, eveningHour: 6 }
    expect(nextReminderCheck(at(21, 3), odd)).toEqual(at(21, 6))
    expect(nextReminderCheck(at(21, 7), odd)).toEqual(at(21, 18))
    expect(nextReminderCheck(at(21, 19), odd)).toEqual(at(22, 6))
  })

  it('handles equal hours', () => {
    expect(nextReminderCheck(at(21, 9), { morningHour: 9, eveningHour: 9 })).toEqual(at(22, 9))
  })

  it('rolls over month and year ends', () => {
    expect(nextReminderCheck(new Date(2026, 11, 31, 22), SETTINGS)).toEqual(new Date(2027, 0, 1, 8))
  })

  it('stays on local wall-clock hours across DST changes', () => {
    // US spring-forward 2026-03-08, fall-back 2026-11-01.
    expect(nextReminderCheck(new Date(2026, 2, 7, 21), SETTINGS)).toEqual(new Date(2026, 2, 8, 8))
    expect(nextReminderCheck(new Date(2026, 9, 31, 21), SETTINGS)).toEqual(new Date(2026, 10, 1, 8))
    expect(nextReminderCheck(new Date(2026, 10, 1, 21), SETTINGS)).toEqual(new Date(2026, 10, 2, 8))
  })

  it('clamps nonsensical hours into 0-23', () => {
    const next = nextReminderCheck(at(21, 12), { morningHour: 99, eveningHour: -5 })
    expect(next.getHours()).toBeGreaterThanOrEqual(0)
    expect(next.getHours()).toBeLessThanOrEqual(23)
    expect(next.getTime()).toBeGreaterThan(at(21, 12).getTime())
  })
})

describe('DST-safe reminder windows', () => {
  it('fires evening-before and morning-of across the fall-back night', () => {
    const t = makeTask('t', { due: '2026-11-01' })
    const sat9pm = new Date(2026, 9, 31, 21)
    const sun9am = new Date(2026, 10, 1, 9)
    expect(dueReminders([t], sat9pm, SETTINGS, NONE).map((r) => r.kind)).toEqual(['evening-before'])
    expect(dueReminders([t], sun9am, SETTINGS, NONE).map((r) => r.kind)).toEqual(['morning-of'])
  })

  it('fires across the spring-forward night', () => {
    const t = makeTask('t', { due: '2026-03-08' })
    expect(dueReminders([t], new Date(2026, 2, 7, 21), SETTINGS, NONE).map((r) => r.kind)).toEqual(['evening-before'])
    expect(dueReminders([t], new Date(2026, 2, 8, 9), SETTINGS, NONE).map((r) => r.kind)).toEqual(['morning-of'])
  })
})

describe('DEFAULT_REMINDER_SETTINGS', () => {
  it('has a morning hour before the evening hour', () => {
    expect(DEFAULT_REMINDER_SETTINGS.morningHour).toBeLessThan(DEFAULT_REMINDER_SETTINGS.eveningHour)
  })
})

describe('pruneFired', () => {
  it('keeps keys that could still matter and drops the rest', () => {
    const tasks = [
      makeTask('open', { due: '2026-10-20' }),
      makeTask('done', { due: '2026-10-20', done: true }),
      makeTask('moved', { due: '2026-10-30' }),
    ]
    const fired = [
      'overdue:open:2026-10-20',
      'overdue:done:2026-10-20',
      'morning-of:moved:2026-10-21',
      'evening-before:gone:2026-10-22',
      'summary:2026-10-20:mixed:4',
      'summary:2026-10-21:mixed:4',
    ]
    expect(pruneFired(fired, tasks, NOW)).toEqual(['overdue:open:2026-10-20', 'summary:2026-10-21:mixed:4'])
  })
})
