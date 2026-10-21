import { describe, expect, it } from 'vitest'
import { detectFormat, parseImport } from '../import'
import { NOW } from './areas'

describe('detectFormat: by extension', () => {
  it.each([
    ['notes.md', 'markdown'],
    ['notes.MARKDOWN', 'markdown'],
    ['export.json', 'json'],
    ['todoist.CSV', 'csv'],
    ['list.txt', 'text'],
  ])('%s -> %s', (filename, format) => {
    expect(detectFormat('anything', filename)).toBe(format)
  })

  it('extension beats content', () => {
    expect(detectFormat('{"a":1}', 'list.txt')).toBe('text')
    expect(detectFormat('1. a\n2. b', 'x.json')).toBe('json')
  })
})

describe('detectFormat: sniffing', () => {
  it('detects JSON by a leading [ or {', () => {
    expect(detectFormat('[{"title":"a"}]')).toBe('json')
    expect(detectFormat('  \n{"tasks":[]}')).toBe('json')
  })

  it('detects markdown by checkboxes or headings', () => {
    expect(detectFormat('- [ ] a\n- [x] b')).toBe('markdown')
    expect(detectFormat('* [ ] a')).toBe('markdown')
    expect(detectFormat('# Title\n- a')).toBe('markdown')
    expect(detectFormat('some words\n## Career\n- a')).toBe('markdown')
  })

  it('does not mistake #tags for headings', () => {
    expect(detectFormat('Email mentee #orgs\nBuy milk #life')).toBe('text')
  })

  it('detects CSV by commas in the first line plus a known header', () => {
    expect(detectFormat('TYPE,CONTENT,DESCRIPTION,PRIORITY\ntask,a,,1')).toBe('csv')
    expect(detectFormat('title,area,due\na,b,c')).toBe('csv')
    expect(detectFormat('Task,Category,Notes\na,b,c')).toBe('csv')
  })

  it('does not call ordinary comma-separated sentences CSV', () => {
    expect(detectFormat('Buy milk, eggs, bread\nCall mom')).toBe('text')
    expect(detectFormat('title, then more')).toBe('text')
  })

  it('falls back to text', () => {
    expect(detectFormat('1. a\n2. b')).toBe('text')
    expect(detectFormat('')).toBe('text')
  })
})

describe('parseImport', () => {
  it('dispatches by detected format', () => {
    expect(parseImport('1. a', NOW).format).toBe('text')
    expect(parseImport('- [ ] a', NOW).format).toBe('markdown')
    expect(parseImport('[{"title":"a"}]', NOW).format).toBe('json')
    expect(parseImport('title,area\na,b', NOW).format).toBe('csv')
  })

  it('honors the filename extension', () => {
    expect(parseImport('- a', NOW, 'x.txt').format).toBe('text')
    expect(parseImport('- a', NOW, 'x.md').format).toBe('markdown')
  })

  it('strips a leading BOM', () => {
    expect(parseImport('﻿[{"title":"a"}]', NOW).drafts).toHaveLength(1)
  })

  it('throws a clear error for invalid JSON', () => {
    expect(() => parseImport('{ not json', NOW)).toThrow(/valid JSON/i)
  })

  it('throws for input over 2,000,000 characters', () => {
    const big = 'a\n'.repeat(1_000_001)
    expect(() => parseImport(big, NOW)).toThrow(/too large|2,000,000/i)
  })

  it('accepts input of exactly 2,000,000 characters', () => {
    const ok = 'x'.repeat(2_000_000)
    expect(parseImport(ok, NOW).drafts.length).toBeGreaterThan(0)
  })

  it('caps at 1000 tasks with a warning', () => {
    const text = Array.from({ length: 1200 }, (_, i) => `Task ${i}`).join('\n')
    const { drafts, warnings } = parseImport(text, NOW)
    expect(drafts).toHaveLength(1000)
    expect(drafts[999]?.title).toBe('Task 999')
    expect(warnings.some((w) => w.includes('1000') && w.includes('1200'))).toBe(true)
  })

  it('does not warn about the cap at exactly 1000', () => {
    const text = Array.from({ length: 1000 }, (_, i) => `Task ${i}`).join('\n')
    expect(parseImport(text, NOW).warnings).toEqual([])
  })

  it('warns when nothing could be imported', () => {
    const { drafts, warnings } = parseImport('   \n  ', NOW)
    expect(drafts).toEqual([])
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('handles special characters and unicode', () => {
    const { drafts } = parseImport("1. Café ☕ — O'Brien <b>bold</b> \"quoted\" ; DROP TABLE tasks;--", NOW)
    expect(drafts[0]?.title).toBe("Café ☕ — O'Brien <b>bold</b> \"quoted\" ; DROP TABLE tasks;--")
  })

  it.each([
    ['text', `Task\n${Array.from({ length: 500 }, (_, i) => `  step ${i}`).join('\n')}`, 'a.txt'],
    ['markdown', `- Task\n${Array.from({ length: 500 }, (_, i) => `  - step ${i}`).join('\n')}`, 'a.md'],
  ])('caps %s steps at 200 per task with a warning', (_name, text, filename) => {
    const { drafts, warnings } = parseImport(text, NOW, filename)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.steps).toHaveLength(200)
    expect(warnings.some((w) => w.includes('300'))).toBe(true)
  })

  it('handles a huge number of steps quickly', () => {
    const text = `- Task\n${'  - s\n'.repeat(250_000)}`
    const started = performance.now()
    expect(parseImport(text, NOW, 'big.md').drafts[0]?.steps).toHaveLength(200)
    expect(performance.now() - started).toBeLessThan(3000)
  })
})
