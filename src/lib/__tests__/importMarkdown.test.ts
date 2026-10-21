import { describe, expect, it } from 'vitest'
import { parseImport } from '../import'
import { NOW } from './areas'

const run = (text: string): ReturnType<typeof parseImport> => parseImport(text, NOW, 'list.md')

describe('markdown import', () => {
  it('parses checkbox, plain-bullet and numbered items', () => {
    const md = ['- [ ] Open', '- [x] Closed', '* [ ] Star open', '* Plain star', '- Plain dash', '1. Numbered', '2) Numbered paren']
    const { format, drafts } = run(md.join('\n'))
    expect(format).toBe('markdown')
    expect(drafts.map((d) => [d.title, d.done ?? false])).toEqual([
      ['Open', false],
      ['Closed', true],
      ['Star open', false],
      ['Plain star', false],
      ['Plain dash', false],
      ['Numbered', false],
      ['Numbered paren', false],
    ])
  })

  it('nests indented items as steps with their done state', () => {
    const md = '- [ ] Plan trip\n  - [x] Book flights\n  - [ ] Pack\n- [ ] Next'
    const { drafts } = run(md)
    expect(drafts).toHaveLength(2)
    expect(drafts[0]?.steps).toEqual([
      { title: 'Book flights', done: true },
      { title: 'Pack', done: false },
    ])
    expect(drafts[1]?.steps ?? []).toEqual([])
  })

  it('flattens deeper nesting into steps, including tab indentation', () => {
    const md = '- Task\n  - Step A\n    - Deep B\n\t\t- Deeper C\n- Task 2'
    const { drafts } = run(md)
    expect(drafts.map((d) => d.title)).toEqual(['Task', 'Task 2'])
    expect(drafts[0]?.steps?.map((s) => s.title)).toEqual(['Step A', 'Deep B', 'Deeper C'])
  })

  it('treats an indented list that starts the document as tasks', () => {
    expect(run('  - first\n  - second').drafts.map((d) => d.title)).toEqual(['first', 'second'])
  })

  it('uses headings as the area hint for following items', () => {
    const md = '## Career\n- Update resume\n- Apply\n\n## Life\n- Buy milk\n### Sub\n- Deeper'
    const { drafts } = run(md)
    expect(drafts.map((d) => [d.title, d.area])).toEqual([
      ['Update resume', 'Career'],
      ['Apply', 'Career'],
      ['Buy milk', 'Life'],
      ['Deeper', 'Sub'],
    ])
  })

  it('leaves area undefined before any heading', () => {
    expect(run('- a\n## B\n- c').drafts.map((d) => d.area)).toEqual([undefined, 'B'])
  })

  it('ignores the Nearer export title heading', () => {
    const { drafts } = run('# Nearer export — 2026-10-21\n- loose')
    expect(drafts[0]?.area).toBeUndefined()
  })

  it('cleans markup from heading text', () => {
    expect(run('## **Career** ##\n- a').drafts[0]?.area).toBe('Career')
  })

  it('ignores paragraphs and warns with a count', () => {
    const { drafts, warnings } = run('Some intro text\n\n- real task\n\nAnother paragraph\n> quote')
    expect(drafts.map((d) => d.title)).toEqual(['real task'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('3')
  })

  it('does not warn when everything was understood', () => {
    expect(run('# H\n- a\n\n- b').warnings).toEqual([])
  })

  it('reads Obsidian Tasks emoji for due date and priority', () => {
    const { drafts } = run('- [ ] Submit report 📅 2026-11-03 ⏫\n- [ ] Urgent thing 🔺\n- [ ] Low 🔽 ⏳ 2026-11-01')
    expect(drafts[0]).toMatchObject({ title: 'Submit report', due: '2026-11-03', high: true })
    expect(drafts[1]).toMatchObject({ title: 'Urgent thing', high: true })
    expect(drafts[2]?.title).toBe('Low')
    expect(drafts[2]?.high).toBeFalsy()
    expect(drafts[2]?.due).toBeUndefined()
  })

  it('keeps titles literal (no natural-language date parsing)', () => {
    const [d] = run('- Call dentist tomorrow #1').drafts
    expect(d).toMatchObject({ title: 'Call dentist tomorrow #1' })
    expect(d?.due).toBeUndefined()
  })

  it('skips empty items', () => {
    expect(run('- \n- [ ] \n- real').drafts.map((d) => d.title)).toEqual(['real'])
  })

  it('handles CRLF line endings', () => {
    expect(run('- a\r\n  - b\r\n- c\r\n').drafts.map((d) => d.steps?.length ?? 0)).toEqual([1, 0])
  })
})
