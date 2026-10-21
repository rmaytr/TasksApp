import { describe, expect, it } from 'vitest'
import { parseCapture } from '../capture'
import { DEFAULT_AREAS, NOW } from './areas'

const parse = (input: string): ReturnType<typeof parseCapture> => parseCapture(input, DEFAULT_AREAS, NOW)

describe('parseCapture', () => {
  it('parses the canonical example', () => {
    const { draft, chips } = parse('Email mentee #orgs tomorrow !')
    expect(draft).toEqual({ title: 'Email mentee', area: 'Orgs', due: '2026-10-22', high: true })
    expect(chips).toEqual([
      { kind: 'area', label: 'Orgs' },
      { kind: 'due', label: 'Tomorrow' },
      { kind: 'high', label: 'High priority' },
    ])
  })

  it('returns a bare title with no chips for plain text', () => {
    expect(parse('Buy milk')).toEqual({ draft: { title: 'Buy milk' }, chips: [] })
  })

  it('handles empty and whitespace-only input', () => {
    expect(parse('')).toEqual({ draft: { title: '' }, chips: [] })
    expect(parse('   \t ')).toEqual({ draft: { title: '' }, chips: [] })
  })

  it('collapses whitespace in the title', () => {
    expect(parse('  Buy   milk   ').draft.title).toBe('Buy milk')
  })

  describe('#area', () => {
    it('resolves names, prefixes, and synonyms to the area name', () => {
      expect(parse('x #class').draft.area).toBe('Classes')
      expect(parse('x #proj').draft.area).toBe('Projects')
      expect(parse('x #job').draft.area).toBe('Career')
      expect(parse('x #LIFE').draft.area).toBe('Life')
    })

    it('uses the resolved area name as the chip label', () => {
      expect(parse('x #class').chips).toEqual([{ kind: 'area', label: 'Classes' }])
    })

    it('keeps unresolvable tags in the title and leaves area undefined', () => {
      const { draft, chips } = parse('Fix #unknown thing')
      expect(draft).toEqual({ title: 'Fix #unknown thing' })
      expect(draft.area).toBeUndefined()
      expect(chips).toEqual([])
    })

    it('never treats # followed by a digit as a tag', () => {
      expect(parse('Add hackathon #1 place').draft).toEqual({ title: 'Add hackathon #1 place' })
    })

    it('does not set an area when none is given', () => {
      expect(parse('Finish CS303 homework').draft.area).toBeUndefined()
    })

    it('first recognized tag wins and all recognized tags are stripped', () => {
      expect(parse('x #orgs #career').draft).toEqual({ title: 'x', area: 'Orgs' })
    })
  })

  describe('!', () => {
    it.each(['Fix bug !', 'Fix bug !!', 'Fix bug !high', '! Fix bug', 'Fix ! bug'])('%j -> high', (input) => {
      const { draft, chips } = parse(input)
      expect(draft.high).toBe(true)
      expect(draft.title).toMatch(/^Fix bug$|^Fix bug$/)
      expect(chips).toEqual([{ kind: 'high', label: 'High priority' }])
    })

    it('does not treat attached or embedded exclamation marks as priority', () => {
      expect(parse('Wow!').draft).toEqual({ title: 'Wow!' })
      expect(parse('Call !important person').draft).toEqual({ title: 'Call !important person' })
    })
  })

  describe('@horizon', () => {
    it.each([
      ['@today', 'today', 'Today'],
      ['@week', 'week', 'This week'],
      ['@month', 'month', 'This month'],
      ['@later', 'later', 'Later'],
      ['@someday', 'someday', 'Someday'],
      ['@SOMEDAY', 'someday', 'Someday'],
    ])('%s', (token, horizon, label) => {
      const { draft, chips } = parse(`Read book ${token}`)
      expect(draft).toEqual({ title: 'Read book', horizon })
      expect(chips).toEqual([{ kind: 'horizon', label }])
    })

    it('leaves unknown @words in the title', () => {
      expect(parse('Ping @bob').draft).toEqual({ title: 'Ping @bob' })
      expect(parse('Ping @tmrw').draft.horizon).toBeUndefined()
    })

    it('first horizon wins and all are stripped', () => {
      expect(parse('x @week @month').draft).toEqual({ title: 'x', horizon: 'week' })
    })
  })

  describe('~effort', () => {
    it.each([
      ['~s', 's', 'Quick'],
      ['~m', 'm', 'Medium'],
      ['~l', 'l', 'Big'],
      ['~quick', 's', 'Quick'],
      ['~big', 'l', 'Big'],
      ['~L', 'l', 'Big'],
    ])('%s', (token, effort, label) => {
      const { draft, chips } = parse(`Write essay ${token}`)
      expect(draft).toEqual({ title: 'Write essay', effort })
      expect(chips).toEqual([{ kind: 'effort', label }])
    })

    it('leaves unknown ~words in the title', () => {
      expect(parse('Approx ~5 min').draft.title).toBe('Approx ~5 min')
    })
  })

  describe('natural dates', () => {
    it.each([
      ['Call mom today', '2026-10-21', 'Today', 'Call mom'],
      ['Pay rent fri', '2026-10-23', 'Fri', 'Pay rent'],
      ['Hand in essay next week', '2026-10-26', 'Mon', 'Hand in essay'],
      ['Renew visa nov 3', '2026-11-03', 'Nov 3', 'Renew visa'],
      ['Renew visa 11/3', '2026-11-03', 'Nov 3', 'Renew visa'],
      ['Finish in 3 days', '2026-10-24', 'Sat', 'Finish'],
      ['tomorrow Email dean', '2026-10-22', 'Tomorrow', 'Email dean'],
      ['Email the dean tomorrow about housing', '2026-10-22', 'Tomorrow', 'Email the dean about housing'],
    ])('%j', (input, due, label, title) => {
      const { draft, chips } = parse(input)
      expect(draft.due).toBe(due)
      expect(draft.title).toBe(title)
      expect(chips).toEqual([{ kind: 'due', label }])
    })

    it('strips a dangling preposition directly before the date', () => {
      expect(parse('Submit report by friday').draft.title).toBe('Submit report')
      expect(parse('Dentist on nov 3').draft.title).toBe('Dentist')
    })

    it('only uses the first date phrase', () => {
      const { draft } = parse('Plan fri then nov 3')
      expect(draft.due).toBe('2026-10-23')
      expect(draft.title).toBe('Plan then nov 3')
    })

    it('does not strip a date phrase if it would leave an empty title', () => {
      const { draft } = parse('tomorrow')
      expect(draft.title).toBe('tomorrow')
    })

    it('keeps the title when other tokens are removed but only a date remains', () => {
      expect(parse('#orgs friday !').draft.title).toBe('friday')
    })

    it('does not false-positive on course codes or common words', () => {
      expect(parse('Finish CS303 homework').draft).toEqual({ title: 'Finish CS303 homework' })
      expect(parse('I may need help').draft).toEqual({ title: 'I may need help' })
      expect(parse('Take CS50').draft).toEqual({ title: 'Take CS50' })
    })

    it('does not parse dates out of unresolved #tags', () => {
      expect(parse('x #fri').draft).toEqual({ title: 'x #fri' })
    })
  })

  it('combines every token kind', () => {
    const { draft, chips } = parse('Finish lab report #class fri !! @week ~l')
    expect(draft).toEqual({
      title: 'Finish lab report',
      area: 'Classes',
      due: '2026-10-23',
      high: true,
      horizon: 'week',
      effort: 'l',
    })
    expect(chips.map((c) => c.kind)).toEqual(['area', 'due', 'horizon', 'high', 'effort'])
  })

  it('handles unicode and emoji titles', () => {
    expect(parse('Café ☕ meeting #orgs').draft).toEqual({ title: 'Café ☕ meeting', area: 'Orgs' })
  })

  it('does not mutate the areas it is given', () => {
    const before = JSON.stringify(DEFAULT_AREAS)
    parse('x #class')
    expect(JSON.stringify(DEFAULT_AREAS)).toBe(before)
  })
})
