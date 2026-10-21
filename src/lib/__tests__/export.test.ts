import { describe, expect, it } from 'vitest'
import type { Area, Task } from '../../model/types'
import { toExportFile, toJSON, toMarkdown } from '../export'
import { parseImport } from '../import'
import { DEFAULT_AREAS, NOW } from './areas'

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title' | 'areaId'>): Task {
  return {
    notes: '',
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
    updatedAt: 2000,
    spentMinutes: 0,
    ...overrides,
  }
}

const tasks: Task[] = [
  makeTask({
    id: 't1',
    title: 'Finish CS303 homework',
    areaId: 'classes',
    horizon: 'today',
    due: '2026-10-23',
    high: true,
    notes: 'chapter 4',
    steps: [
      { id: 's1', title: 'Read chapter', done: true },
      { id: 's2', title: 'Write answers', done: false },
    ],
  }),
  makeTask({ id: 't2', title: 'Email mentee', areaId: 'orgs', waiting: 'reply', plan: 'Friday library' }),
  makeTask({ id: 't3', title: 'Renew visa', areaId: 'life', done: true, doneAt: 5000, due: '2026-11-03' }),
  makeTask({ id: 't4', title: 'Update resume', areaId: 'career', horizon: 'week', effort: 'l', spentMinutes: 30 }),
]

describe('toExportFile', () => {
  it('wraps areas and tasks with app metadata', () => {
    const file = toExportFile(DEFAULT_AREAS, tasks, NOW)
    expect(file.app).toBe('nearer')
    expect(file.version).toBe(1)
    expect(file.exportedAt).toBe(NOW.toISOString())
    expect(file.areas).toEqual(DEFAULT_AREAS)
    expect(file.tasks).toEqual(tasks)
  })

  it('copies rather than aliases its inputs', () => {
    const file = toExportFile(DEFAULT_AREAS, tasks, NOW)
    expect(file.tasks).not.toBe(tasks)
    expect(file.tasks[0]).not.toBe(tasks[0])
    expect(file.tasks[0]?.steps[0]).not.toBe(tasks[0]?.steps[0])
    expect(file.areas[0]).not.toBe(DEFAULT_AREAS[0])
  })

  it('handles empty inputs', () => {
    expect(toExportFile([], [], NOW)).toMatchObject({ areas: [], tasks: [] })
  })
})

describe('toJSON', () => {
  it('produces pretty-printed JSON that parses back to the export file', () => {
    const json = toJSON(DEFAULT_AREAS, tasks, NOW)
    expect(json).toContain('\n  "app": "nearer"')
    expect(JSON.parse(json)).toEqual(toExportFile(DEFAULT_AREAS, tasks, NOW))
  })

  it('round-trips through parseImport, keeping every field', () => {
    const { format, drafts, warnings } = parseImport(toJSON(DEFAULT_AREAS, tasks, NOW), NOW, 'backup.json')
    expect(format).toBe('json')
    expect(warnings).toEqual([])
    expect(drafts).toHaveLength(4)
    expect(drafts[0]).toEqual({
      title: 'Finish CS303 homework',
      notes: 'chapter 4',
      area: 'Classes',
      horizon: 'today',
      due: '2026-10-23',
      high: true,
      effort: 'm',
      waiting: null,
      plan: null,
      steps: [
        { title: 'Read chapter', done: true },
        { title: 'Write answers', done: false },
      ],
      done: false,
    })
    expect(drafts[1]).toMatchObject({ area: 'Orgs', waiting: 'reply', plan: 'Friday library' })
    expect(drafts[2]).toMatchObject({ area: 'Life', done: true, due: '2026-11-03' })
    expect(drafts[3]).toMatchObject({ area: 'Career', horizon: 'week', effort: 'l' })
  })
})

describe('toMarkdown', () => {
  const md = toMarkdown(DEFAULT_AREAS, tasks, NOW)

  it('starts with a dated title and has one ## heading per area, in order', () => {
    expect(md.split('\n')[0]).toBe('# Nearer export — 2026-10-21')
    const headings = md.split('\n').filter((l) => l.startsWith('## '))
    expect(headings).toEqual(DEFAULT_AREAS.map((a) => `## ${a.name}`))
  })

  it('formats tasks, due dates, priority, done and nested steps', () => {
    expect(md).toContain('- [ ] Finish CS303 homework 📅 2026-10-23 ⏫\n  - [x] Read chapter\n  - [ ] Write answers')
    expect(md).toContain('- [ ] Email mentee\n')
    expect(md).toContain('- [x] Renew visa 📅 2026-11-03')
  })

  it('puts tasks under their own area heading', () => {
    const orgsSection = md.split('## Orgs')[1]?.split('## ')[0] ?? ''
    expect(orgsSection).toContain('Email mentee')
    expect(orgsSection).not.toContain('Renew visa')
  })

  it('places tasks with an unknown area under "Other"', () => {
    const out = toMarkdown(DEFAULT_AREAS, [makeTask({ id: 'x', title: 'Lost', areaId: 'gone' })], NOW)
    expect(out).toContain('## Other\n\n- [ ] Lost')
  })

  it('flattens newlines in titles', () => {
    const out = toMarkdown(DEFAULT_AREAS, [makeTask({ id: 'x', title: 'a\nb', areaId: 'life' })], NOW)
    expect(out).toContain('- [ ] a b')
  })

  it('handles no tasks', () => {
    expect(toMarkdown([], [], NOW)).toBe('# Nearer export — 2026-10-21\n')
  })
})

describe('markdown round trip', () => {
  it('preserves titles, areas, steps, done, due and high', () => {
    const { format, drafts, warnings } = parseImport(toMarkdown(DEFAULT_AREAS, tasks, NOW), NOW, 'export.md')
    expect(format).toBe('markdown')
    expect(warnings).toEqual([])
    const byTitle = Object.fromEntries(drafts.map((d) => [d.title, d]))
    expect(Object.keys(byTitle).sort()).toEqual(tasks.map((t) => t.title).sort())

    expect(byTitle['Finish CS303 homework']).toMatchObject({
      area: 'Classes',
      due: '2026-10-23',
      high: true,
      steps: [
        { title: 'Read chapter', done: true },
        { title: 'Write answers', done: false },
      ],
    })
    expect(byTitle['Email mentee']).toMatchObject({ area: 'Orgs' })
    expect(byTitle['Email mentee']?.high).toBeFalsy()
    expect(byTitle['Email mentee']?.due).toBeUndefined()
    expect(byTitle['Renew visa']).toMatchObject({ area: 'Life', done: true, due: '2026-11-03' })
    expect(byTitle['Update resume']).toMatchObject({ area: 'Career' })
  })

  it('round-trips awkward titles unchanged', () => {
    const odd: Area[] = [{ id: 'a', name: 'Café ☕', color: 'sky' }]
    const titles = ['Call mom tomorrow', 'Add hackathon #1 place', 'Ends with period.', 'Colon: yes, list', '1. looks numbered']
    const list = titles.map((title, i) => makeTask({ id: String(i), title, areaId: 'a' }))
    const { drafts } = parseImport(toMarkdown(odd, list, NOW), NOW, 'x.md')
    expect(drafts.map((d) => d.title)).toEqual(titles)
    expect(drafts.every((d) => d.area === 'Café ☕' && d.due === undefined)).toBe(true)
  })
})
