import { describe, expect, it } from 'vitest'
import { parseCsv } from '../import/csv'
import { parseImport } from '../import'
import { NOW } from './areas'

const run = (text: string): ReturnType<typeof parseImport> => parseImport(text, NOW, 'tasks.csv')

describe('parseCsv (RFC 4180)', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })
  it('handles quoted fields with commas, escaped quotes and newlines', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n"line1\nline2",z')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['line1\nline2', 'z'],
    ])
  })
  it('handles CRLF, trailing newline and BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('keeps empty fields', () => {
    expect(parseCsv('a,,c\n,,')).toEqual([['a', '', 'c'], ['', '', '']])
  })
  it('tolerates an unterminated quote', () => {
    expect(parseCsv('a,b\n"open,1')).toEqual([['a', 'b'], ['open,1']])
  })
  it('returns no rows for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('csv import: generic', () => {
  it('maps title/area/due/notes/priority columns', () => {
    const csv = 'Title,Category,Due,Notes,Priority\nBuy milk,Life,2026-11-03,2%,high\nEmail dean,Classes,tomorrow,"ask, politely",\n'
    const { format, drafts } = run(csv)
    expect(format).toBe('csv')
    expect(drafts).toEqual([
      { title: 'Buy milk', area: 'Life', due: '2026-11-03', notes: '2%', high: true },
      { title: 'Email dean', area: 'Classes', due: '2026-10-22', notes: 'ask, politely' },
    ])
  })

  it('recognizes alternate header names case-insensitively', () => {
    const { drafts } = run('TASK,LIST,DEADLINE,DESCRIPTION\nA,Work,11/3,n')
    expect(drafts[0]).toMatchObject({ title: 'A', area: 'Work', due: '2026-11-03', notes: 'n' })
    expect(run('Name,Date\nB,fri').drafts[0]).toMatchObject({ title: 'B', due: '2026-10-23' })
    expect(run('content\nC').drafts[0]?.title).toBe('C')
  })

  it('maps priority variants and the done column', () => {
    const { drafts } = run('title,priority,done\na,p1,\nb,urgent,\nc,low,true\nd,,')
    expect(drafts.map((d) => !!d.high)).toEqual([true, true, false, false])
    expect(drafts.map((d) => !!d.done)).toEqual([false, false, true, false])
  })

  it('skips blank rows and rows without a title', () => {
    const { drafts } = run('title,area\na,x\n,,\n,orphan\n\nb,y')
    expect(drafts.map((d) => d.title)).toEqual(['a', 'b'])
  })

  it('handles quoted fields, CRLF and embedded newlines in notes', () => {
    const { drafts } = run('title,notes\r\n"Say ""hi""","line1\nline2"\r\nplain,x\r\n')
    expect(drafts[0]).toMatchObject({ title: 'Say "hi"', notes: 'line1\nline2' })
    expect(drafts[1]?.title).toBe('plain')
  })

  it('ignores unknown columns', () => {
    expect(run('title,secret\nA,hunter2').drafts).toEqual([{ title: 'A' }])
  })

  it('throws when there is no title-like header', () => {
    expect(() => run('foo,bar\n1,2')).toThrow(/title|content/i)
  })

  it('throws for a header-only/empty file', () => {
    expect(() => run('')).toThrow()
  })

  it('returns no drafts for a header-only file', () => {
    expect(run('title,area\n').drafts).toEqual([])
  })

  it('clamps long fields', () => {
    const { drafts } = run(`title,notes\n${'x'.repeat(400)},${'n'.repeat(6000)}`)
    expect(drafts[0]?.title).toHaveLength(300)
    expect(drafts[0]?.notes).toHaveLength(5000)
  })
})

describe('csv import: Todoist', () => {
  const header = 'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE'
  const csv = [
    header,
    'section,Career,,4,1,,,,,',
    'task,Update resume,use template,4,1,me,,nov 3,en,UTC',
    'task,Gather projects,,1,2,me,,,,',
    'task,Export PDF,,1,3,me,,,,',
    'task,"Email recruiter, again",,3,1,me,,every friday,en,UTC',
    'note,A comment,,,,,,,,',
    'section,Life,,4,1,,,,,',
    'task,Buy milk,,1,1,me,,tomorrow,en,UTC',
    ',,,,,,,,,',
  ].join('\n')

  it('maps tasks, indent-as-steps, priority 4 as high, dates and notes', () => {
    const { drafts } = run(csv)
    expect(drafts).toEqual([
      {
        title: 'Update resume',
        area: 'Career',
        notes: 'use template',
        high: true,
        due: '2026-11-03',
        steps: [
          { title: 'Gather projects', done: false },
          { title: 'Export PDF', done: false },
        ],
      },
      { title: 'Email recruiter, again', area: 'Career' },
      { title: 'Buy milk', area: 'Life', due: '2026-10-22' },
    ])
  })

  it('treats priority 1-3 as not high', () => {
    const { drafts } = run(`${header}\ntask,a,,1,1,,,,,\ntask,b,,2,1,,,,,\ntask,c,,3,1,,,,,\ntask,d,,4,1,,,,,`)
    expect(drafts.map((d) => !!d.high)).toEqual([false, false, false, true])
  })

  it('ignores recurring dates instead of mis-parsing the weekday', () => {
    const { drafts } = run(`${header}\ntask,a,,1,1,,,every friday,en,UTC`)
    expect(drafts[0]?.due).toBeUndefined()
  })

  it('an indented task with no parent becomes a task', () => {
    const { drafts } = run(`${header}\ntask,orphan,,1,2,,,,,`)
    expect(drafts.map((d) => d.title)).toEqual(['orphan'])
  })

  it('works without a section column value or INDENT', () => {
    const { drafts } = run('TYPE,CONTENT\ntask,a\ntask,b')
    expect(drafts.map((d) => d.title)).toEqual(['a', 'b'])
  })
})
