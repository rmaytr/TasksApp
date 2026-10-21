import { describe, expect, it } from 'vitest'
import type { Area, ExportFile, Task } from '../../model/types'
import { parseImport } from '../import'
import { NOW } from './areas'

const run = (value: unknown): ReturnType<typeof parseImport> =>
  parseImport(typeof value === 'string' ? value : JSON.stringify(value), NOW, 'data.json')

const areas: Area[] = [
  { id: 'a-career', name: 'Career', color: 'teal' },
  { id: 'a-life', name: 'Life', color: 'olive' },
]

const fullTask: Task = {
  id: 't1',
  title: 'Update resume',
  notes: 'Use the new template',
  areaId: 'a-career',
  horizon: 'week',
  due: '2026-11-03',
  high: true,
  effort: 'm',
  waiting: 'reference letter',
  plan: 'Thursday at the library',
  steps: [
    { id: 's1', title: 'Gather projects', done: true },
    { id: 's2', title: 'Export PDF', done: false },
  ],
  done: false,
  doneAt: null,
  createdAt: 1,
  updatedAt: 2,
  spentMinutes: 15,
}

const exportFile = (tasks: Task[]): ExportFile => ({
  app: 'nearer',
  version: 1,
  exportedAt: '2026-10-21T00:00:00.000Z',
  areas,
  tasks,
})

describe('json import: Nearer ExportFile', () => {
  it('maps areaId to area name and keeps every field', () => {
    const { format, drafts, warnings } = run(exportFile([fullTask]))
    expect(format).toBe('json')
    expect(warnings).toEqual([])
    expect(drafts).toEqual([
      {
        title: 'Update resume',
        notes: 'Use the new template',
        area: 'Career',
        horizon: 'week',
        due: '2026-11-03',
        high: true,
        effort: 'm',
        waiting: 'reference letter',
        plan: 'Thursday at the library',
        steps: [
          { title: 'Gather projects', done: true },
          { title: 'Export PDF', done: false },
        ],
        done: false,
      },
    ])
  })

  it('keeps done tasks done and null waiting/plan/due', () => {
    const task: Task = { ...fullTask, done: true, doneAt: 5, due: null, waiting: null, plan: null }
    expect(run(exportFile([task])).drafts[0]).toMatchObject({ done: true, due: null, waiting: null, plan: null })
  })

  it('falls back to the raw areaId when the area is not in the file', () => {
    const task: Task = { ...fullTask, areaId: 'ghost' }
    expect(run(exportFile([task])).drafts[0]?.area).toBe('ghost')
  })

  it('strips ids, timestamps, and unknown fields', () => {
    const [d] = run(exportFile([fullTask])).drafts
    expect(Object.keys(d!)).not.toContain('id')
    expect(Object.keys(d!)).not.toContain('createdAt')
    expect(Object.keys(d!)).not.toContain('spentMinutes')
    expect(d?.steps?.[0]).toEqual({ title: 'Gather projects', done: true })
  })

  it('drops a bad task with a warning without losing the rest', () => {
    const file = { ...exportFile([fullTask]), tasks: [fullTask, { id: 'bad' }, 7, null, { ...fullTask, title: 'Ok' }] }
    const { drafts, warnings } = run(file)
    expect(drafts.map((d) => d.title)).toEqual(['Update resume', 'Ok'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('3')
  })

  it('ignores invalid horizon/effort values instead of dropping the task', () => {
    const [d] = run(exportFile([{ ...fullTask, horizon: 'soon' as never, effort: 'xl' as never }])).drafts
    expect(d?.title).toBe('Update resume')
    expect(d?.horizon).toBeUndefined()
    expect(d?.effort).toBeUndefined()
  })
})

describe('json import: flexible arrays', () => {
  it('accepts an array of objects with alias keys', () => {
    const { drafts } = run([
      { name: 'A', category: 'Life', description: 'n1', deadline: '2026-11-03' },
      { content: 'B', list: 'Career', subtasks: ['x', 'y'] },
      { text: 'C', project: 'Work' },
      { title: 'D', checklist: [{ name: 'p', completed: true }, { text: 'q', checked: false }] },
      { title: 'E', children: [{ title: 'k', done: true }] },
    ])
    expect(drafts.map((d) => d.title)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(drafts[0]).toMatchObject({ area: 'Life', notes: 'n1', due: '2026-11-03' })
    expect(drafts[1]).toMatchObject({ area: 'Career', steps: [{ title: 'x', done: false }, { title: 'y', done: false }] })
    expect(drafts[2]?.area).toBe('Work')
    expect(drafts[3]?.steps).toEqual([{ title: 'p', done: true }, { title: 'q', done: false }])
    expect(drafts[4]?.steps).toEqual([{ title: 'k', done: true }])
  })

  it('accepts {tasks: [...]}', () => {
    expect(run({ tasks: [{ title: 'A' }, { title: 'B' }] }).drafts.map((d) => d.title)).toEqual(['A', 'B'])
  })

  it('accepts an array of plain strings', () => {
    expect(run(['one', 'two']).drafts.map((d) => d.title)).toEqual(['one', 'two'])
  })

  it('maps priority variants to high', () => {
    const highs = ['high', 'HIGH', 'p1', 'P1', '1', 1, 'urgent', true, 'true'].map(
      (priority) => run([{ title: 't', priority }]).drafts[0]?.high,
    )
    expect(highs.every(Boolean)).toBe(true)
    const lows = ['low', 'p3', 3, 'normal', false, 0, '', null].map(
      (priority) => run([{ title: 't', priority }]).drafts[0]?.high,
    )
    expect(lows.every((h) => !h)).toBe(true)
  })

  it('maps done variants', () => {
    expect(run([{ title: 'a', done: true }]).drafts[0]?.done).toBe(true)
    expect(run([{ title: 'a', completed: true }]).drafts[0]?.done).toBe(true)
    expect(run([{ title: 'a', checked: true }]).drafts[0]?.done).toBe(true)
    expect(run([{ title: 'a', done: false }]).drafts[0]?.done).toBeFalsy()
  })

  it('normalizes dates: ISO datetime, natural language, and rejects junk', () => {
    const [a, b, c] = run([
      { title: 'a', due: '2026-11-03T10:00:00Z' },
      { title: 'b', dueDate: 'tomorrow' },
      { title: 'c', date: 'whenever' },
    ]).drafts
    expect(a?.due).toBe('2026-11-03')
    expect(b?.due).toBe('2026-10-22')
    expect(c?.due).toBeUndefined()
  })

  it('accepts an area object with a name', () => {
    expect(run([{ title: 't', area: { name: 'Career' } }]).drafts[0]?.area).toBe('Career')
  })

  it('strips unknown fields', () => {
    const [d] = run([{ title: 't', evil: '<script>', __proto__: { polluted: true }, id: 9 }]).drafts
    expect(d).toEqual({ title: 't' })
  })

  it('drops invalid items with a warning', () => {
    const { drafts, warnings } = run([{ title: 'ok' }, { title: '' }, { foo: 1 }, 42, null, [1], { title: 5 }])
    expect(drafts.map((d) => d.title)).toEqual(['ok'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('6')
  })

  it('skips steps that are empty or malformed but keeps the task', () => {
    const [d] = run([{ title: 't', steps: ['ok', '', 5, { foo: 1 }, { title: 'fine' }] }]).drafts
    expect(d?.steps?.map((s) => s.title)).toEqual(['ok', 'fine'])
  })

  it('clamps long strings', () => {
    const [d] = run([{ title: 'x'.repeat(500), notes: 'n'.repeat(9000), steps: ['s'.repeat(400)] }]).drafts
    expect(d?.title).toHaveLength(300)
    expect(d?.notes).toHaveLength(5000)
    expect(d?.steps?.[0]?.title).toHaveLength(300)
  })

  it('trims whitespace in titles', () => {
    expect(run([{ title: '  padded  ' }]).drafts[0]?.title).toBe('padded')
  })

  it('handles an empty array', () => {
    expect(run([]).drafts).toEqual([])
  })
})

describe('json import: errors', () => {
  it('throws a clear error for invalid JSON', () => {
    expect(() => run('{ nope')).toThrow(/valid JSON/i)
  })

  it('throws when no task list can be found', () => {
    expect(() => run({ hello: 'world' })).toThrow(/tasks/i)
    expect(() => run('"just a string"')).toThrow(/tasks/i)
    expect(() => run('42')).toThrow(/tasks/i)
    expect(() => run('null')).toThrow(/tasks/i)
  })
})
