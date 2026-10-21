import { describe, expect, it } from 'vitest'
import type { Area } from '../../model/types'
import { DEFAULT_AREA_KEYWORDS, guessArea, matchAreaHint, resolveArea } from '../classify'
import { DEFAULT_AREAS } from './areas'

describe('DEFAULT_AREA_KEYWORDS', () => {
  it('is keyed by the six default area names', () => {
    expect(Object.keys(DEFAULT_AREA_KEYWORDS).sort()).toEqual(
      ['Career', 'Classes', 'Learning', 'Life', 'Orgs', 'Projects'],
    )
    for (const patterns of Object.values(DEFAULT_AREA_KEYWORDS)) {
      expect(patterns.length).toBeGreaterThan(3)
      expect(patterns.every((p) => p instanceof RegExp)).toBe(true)
    }
  })
})

describe('guessArea', () => {
  const guess = (text: string): string | null => guessArea(text, DEFAULT_AREAS)

  it.each([
    ['Finish CS303 homework', 'classes'],
    ['Study for MA252 midterm', 'classes'],
    ['PH 222 lab report', 'classes'],
    ['Read the syllabus', 'classes'],
    ['Prep for the quiz', 'classes'],
    ['Update my resume', 'career'],
    ['Message the recruiter on linkedin', 'career'],
    ['Apply for internships on handshake', 'career'],
    ['Write a cover letter', 'career'],
    ['Plan ACM events for the semester', 'orgs'],
    ['Email the club board', 'orgs'],
    ['Volunteering sign-up', 'orgs'],
    ['Ship the prototype', 'projects'],
    ['Push to github', 'projects'],
    ['Finish the tutorial', 'learning'],
    ['Coursera AI courses', 'learning'],
    ['Renew my visa', 'life'],
    ['Go to the gym', 'life'],
    ['Do laundry and buy groceries', 'life'],
    ['File taxes', 'life'],
  ])('%j -> %s', (text, id) => {
    expect(guess(text)).toBe(id)
  })

  it.each(['', 'hello world', 'Call mom', 'the 5 things'])(
    '%j has no signal -> null',
    (text) => {
      expect(guess(text)).toBeNull()
    },
  )

  it('is case-insensitive for words but strict for course codes', () => {
    expect(guess('INTERNSHIP')).toBe('career')
    expect(guess('cs380 reading')).toBeNull()
  })

  it('strongest signal beats a weaker one', () => {
    expect(guess('Apply for housing lottery as soon as its out')).toBe('life')
    expect(guess('Apply for Treehacks')).toBe('projects')
    expect(guess('Update my portfolio')).toBe('career')
  })

  it('breaks ties by the fixed default order', () => {
    // one weight-3 hit each for Classes ("class") and Orgs ("chapter")
    expect(guess('class chapter')).toBe('classes')
  })

  it('works when areas are renamed (scores by name)', () => {
    const renamed: Area[] = [
      { id: 'a1', name: 'School', color: 'indigo' },
      { id: 'a2', name: 'Classes', color: 'rose' },
    ]
    expect(guessArea('Finish MA252 homework', renamed)).toBe('a2')
  })

  it('only scores areas that exist', () => {
    const two: Area[] = [
      { id: 'x', name: 'Career', color: 'teal' },
      { id: 'y', name: 'Life', color: 'olive' },
    ]
    expect(guessArea('Finish CS303 homework', two)).toBeNull()
    expect(guessArea('Update resume', two)).toBe('x')
  })

  it('honors literal area names as words in custom areas', () => {
    const custom: Area[] = [...DEFAULT_AREAS, { id: 'gym', name: 'Gym', color: 'sky' }]
    expect(guessArea('Gym leg day', custom)).toBe('gym')
    expect(guessArea('Gymnastics meet', custom)).not.toBe('gym')
  })

  it('literal custom name beats keyword hits', () => {
    const custom: Area[] = [...DEFAULT_AREAS, { id: 'band', name: 'Band', color: 'sky' }]
    expect(guessArea('Band: finish the homework', custom)).toBe('band')
  })

  it('escapes regex characters in area names', () => {
    const odd: Area[] = [{ id: 'cpp', name: 'C++ (hobby)', color: 'sky' }]
    expect(() => guessArea('learn c++ (hobby)', odd)).not.toThrow()
    expect(guessArea('hello', odd)).toBeNull()
  })

  it('returns null for an empty area list', () => {
    expect(guessArea('homework', [])).toBeNull()
  })
})

describe('matchAreaHint', () => {
  it('matches id, name, prefix, and synonyms', () => {
    expect(matchAreaHint('classes', DEFAULT_AREAS)?.id).toBe('classes')
    expect(matchAreaHint('CAREER', DEFAULT_AREAS)?.id).toBe('career')
    expect(matchAreaHint('#orgs', DEFAULT_AREAS)?.id).toBe('orgs')
    expect(matchAreaHint('class', DEFAULT_AREAS)?.id).toBe('classes')
    expect(matchAreaHint('proj', DEFAULT_AREAS)?.id).toBe('projects')
    expect(matchAreaHint('school', DEFAULT_AREAS)?.id).toBe('classes')
  })

  it('returns null for unknown or too-short hints', () => {
    expect(matchAreaHint('xyz', DEFAULT_AREAS)).toBeNull()
    expect(matchAreaHint('cl', DEFAULT_AREAS)).toBeNull()
    expect(matchAreaHint('', DEFAULT_AREAS)).toBeNull()
  })
})

describe('resolveArea', () => {
  const resolve = (hint: string | undefined, text = ''): { areaId: string; guessed: boolean } =>
    resolveArea(hint, text, DEFAULT_AREAS)

  it('resolves by id and name, case-insensitively', () => {
    expect(resolve('career')).toEqual({ areaId: 'career', guessed: false })
    expect(resolve('Career')).toEqual({ areaId: 'career', guessed: false })
    expect(resolve('LIFE')).toEqual({ areaId: 'life', guessed: false })
    expect(resolve('  orgs  ')).toEqual({ areaId: 'orgs', guessed: false })
  })

  it('resolves by prefix of at least 3 characters', () => {
    expect(resolve('class')).toEqual({ areaId: 'classes', guessed: false })
    expect(resolve('proj')).toEqual({ areaId: 'projects', guessed: false })
    expect(resolve('lear')).toEqual({ areaId: 'learning', guessed: false })
    expect(resolve('car')).toEqual({ areaId: 'career', guessed: false })
  })

  it('does not resolve prefixes shorter than 3 characters', () => {
    expect(resolve('pr', 'plain text')).toEqual({ areaId: 'life', guessed: true })
  })

  it.each([
    ['school', 'classes'],
    ['course', 'classes'],
    ['uni', 'classes'],
    ['club', 'orgs'],
    ['clubs', 'orgs'],
    ['org', 'orgs'],
    ['job', 'career'],
    ['jobs', 'career'],
    ['work', 'career'],
    ['project', 'projects'],
    ['side', 'projects'],
    ['study', 'learning'],
    ['learn', 'learning'],
    ['personal', 'life'],
    ['home', 'life'],
  ])('synonym %s -> %s', (hint, id) => {
    expect(resolve(hint)).toEqual({ areaId: id, guessed: false })
  })

  it('falls back to guessing from the text when the hint is missing or unknown', () => {
    expect(resolve(undefined, 'Finish CS303 homework')).toEqual({ areaId: 'classes', guessed: true })
    expect(resolve('nonsense', 'Update resume')).toEqual({ areaId: 'career', guessed: true })
    expect(resolve('', 'Update resume')).toEqual({ areaId: 'career', guessed: true })
  })

  it('falls back to Life, then to the first area', () => {
    expect(resolve(undefined, 'hello there')).toEqual({ areaId: 'life', guessed: true })
    const noLife: Area[] = [
      { id: 'z', name: 'Zed', color: 'sky' },
      { id: 'y', name: 'Why', color: 'rose' },
    ]
    expect(resolveArea(undefined, 'hello', noLife)).toEqual({ areaId: 'z', guessed: true })
  })

  it('works with custom areas via name hint', () => {
    const custom: Area[] = [...DEFAULT_AREAS, { id: 'gym', name: 'Gym', color: 'sky' }]
    expect(resolveArea('gym', '', custom)).toEqual({ areaId: 'gym', guessed: false })
  })

  it('does not resolve a synonym whose target area was removed', () => {
    const noClasses = DEFAULT_AREAS.filter((a) => a.id !== 'classes')
    expect(resolveArea('school', 'xyz', noClasses).guessed).toBe(true)
  })

  it('returns an empty id when there are no areas at all', () => {
    expect(resolveArea('x', 'y', [])).toEqual({ areaId: '', guessed: true })
  })
})
