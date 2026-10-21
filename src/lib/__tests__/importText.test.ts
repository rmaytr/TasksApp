import { describe, expect, it } from 'vitest'
import { parseImport } from '../import'
import { NOW } from './areas'

const run = (text: string): ReturnType<typeof parseImport> => parseImport(text, NOW, 'list.txt')
const titles = (text: string): string[] => run(text).drafts.map((d) => d.title)
const stepTitles = (d: { steps?: { title: string }[] }): string[] => (d.steps ?? []).map((s) => s.title)

describe('text import: line shapes', () => {
  it('strips numbered, bulleted and bare line markers', () => {
    const text = ['1. One', '2) Two', '- Three', '* Four', '• Five', 'Six'].join('\n')
    expect(titles(text)).toEqual(['One', 'Two', 'Three', 'Four', 'Five', 'Six'])
  })

  it('ignores blank lines and handles CRLF', () => {
    expect(titles('A\r\n\r\n\r\nB\r\n')).toEqual(['A', 'B'])
  })

  it('strips trailing periods but not other punctuation', () => {
    expect(titles('Do it.\nReally?\nWow!')).toEqual(['Do it', 'Really?', 'Wow!'])
  })

  it('returns an empty list for empty input', () => {
    expect(run('')).toMatchObject({ format: 'text', drafts: [] })
    expect(run('  \n \n').drafts).toEqual([])
  })

  it('reports the text format', () => {
    expect(run('a').format).toBe('text')
  })

  it('does not add notes', () => {
    expect(run('1. Plan trip: book flights, pack').drafts[0]?.notes).toBeUndefined()
  })

  it('reads [x] checkboxes as done', () => {
    const [a, b] = run('- [x] Done thing\n- [ ] Open thing').drafts
    expect(a).toMatchObject({ title: 'Done thing', done: true })
    expect(b?.title).toBe('Open thing')
    expect(b?.done).toBeFalsy()
  })
})

describe('text import: steps from indentation', () => {
  it('turns indented lines into steps of the previous task', () => {
    const { drafts } = run('Plan trip\n  book flights\n\t- pack bags\nOther task')
    expect(drafts).toHaveLength(2)
    expect(stepTitles(drafts[0]!)).toEqual(['Book flights', 'Pack bags'])
    expect(drafts[1]?.steps ?? []).toEqual([])
  })

  it('turns letter bullets into steps', () => {
    const { drafts } = run('1. Trip\na. flights\nb) hotel\n2. Taxes')
    expect(titles('1. Trip\na. flights\nb) hotel\n2. Taxes')).toEqual(['Trip', 'Taxes'])
    expect(stepTitles(drafts[0]!)).toEqual(['Flights', 'Hotel'])
  })

  it('treats an indented first line as a top-level task', () => {
    expect(titles('  orphan\nnext')).toEqual(['orphan', 'next'])
  })

  it('a single space of indent is not a step', () => {
    expect(titles('A\n B')).toEqual(['A', 'B'])
  })

  it('strips periods from steps and capitalizes the first letter', () => {
    const { drafts } = run('T\n  do the thing.')
    expect(stepTitles(drafts[0]!)).toEqual(['Do the thing'])
  })
})

describe('text import: "Title: a, b, and c"', () => {
  it('splits a comma list into steps', () => {
    const [d] = run('Groceries: milk, eggs, and bread').drafts
    expect(d?.title).toBe('Groceries')
    expect(stepTitles(d!)).toEqual(['Milk', 'Eggs', 'Bread'])
  })

  it('splits a plain comma list without "and"', () => {
    const [d] = run('Pack: socks, shirts').drafts
    expect(stepTitles(d!)).toEqual(['Socks', 'Shirts'])
  })

  it('splits "a and b" when both sides are multi-word', () => {
    const [d] = run('Prep: get quotes and book venue').drafts
    expect(d?.title).toBe('Prep')
    expect(stepTitles(d!)).toEqual(['Get quotes', 'Book venue'])
  })

  it('does not split on "and" inside a step after a comma', () => {
    const [d] = run('X: on github, and update resume and portfolio').drafts
    expect(stepTitles(d!)).toEqual(['On github', 'Update resume and portfolio'])
  })

  it('keeps a single-piece colon as part of the title', () => {
    expect(titles('Note: call mom')).toEqual(['Note: call mom'])
  })

  it('keeps colons in times and URLs', () => {
    expect(run('Meet at 10:30, then lunch').drafts[0]).toMatchObject({ title: 'Meet at 10:30, then lunch' })
    const url = run('Read https://example.com/a, b, c').drafts[0]
    expect(url?.title).toBe('Read https://example.com/a, b, c')
    expect(url?.steps ?? []).toEqual([])
  })

  it('does not split when any piece is longer than 60 characters', () => {
    const long = 'x'.repeat(61)
    const [d] = run(`Title: short, ${long}`).drafts
    expect(d?.title).toBe(`Title: short, ${long}`)
    expect(d?.steps ?? []).toEqual([])
  })

  it('does not treat a colon with no title before it as a split', () => {
    expect(titles(': a, b')).toEqual([': a, b'])
  })

  it('gives explicit indented steps precedence by appending to the split steps', () => {
    const [d] = run('Trip: flights, hotel\n  visa').drafts
    expect(stepTitles(d!)).toEqual(['Flights', 'Hotel', 'Visa'])
  })
})

describe('text import: area headings', () => {
  const text = ['Career:', 'Update resume', 'Apply to X', '', 'Life:', '- Buy milk', 'Call mom #orgs'].join('\n')

  it('uses a trailing-colon line as the area for following items', () => {
    const { drafts } = run(text)
    expect(drafts.map((d) => [d.title, d.area])).toEqual([
      ['Update resume', 'Career'],
      ['Apply to X', 'Career'],
      ['Buy milk', 'Life'],
      ['Call mom', 'orgs'],
    ])
  })

  it('headings are not tasks', () => {
    expect(titles(text)).not.toContain('Career:')
  })

  it('a long sentence ending with a colon is not a heading', () => {
    const sentence = 'This is a very long sentence that happens to end with a colon so it is not one:'
    expect(titles(sentence)).toEqual([sentence])
  })

  it('areas stay undefined without headings or tags', () => {
    expect(run('Just a task').drafts[0]?.area).toBeUndefined()
  })
})

describe('text import: capture tokens per line', () => {
  it('parses #area, dates, ! and other tokens', () => {
    const [d] = run('Email mentee #orgs tomorrow !').drafts
    expect(d).toMatchObject({ title: 'Email mentee', area: 'orgs', due: '2026-10-22', high: true })
  })

  it('parses effort and horizon', () => {
    expect(run('Read paper @week ~l').drafts[0]).toMatchObject({ title: 'Read paper', horizon: 'week', effort: 'l' })
  })

  it('never treats #<digit> as a tag', () => {
    expect(titles('Add hackathon #1 place')).toEqual(['Add hackathon #1 place'])
  })

  it('skips lines that become empty after token removal', () => {
    expect(titles('#career\nReal task')).toEqual(['Real task'])
  })
})
