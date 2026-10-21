import { describe, expect, it } from 'vitest'
import type { TaskDraft } from '../../model/types'
import { resolveArea } from '../classify'
import { parseImport } from '../import'
import { DEFAULT_AREAS, NOW } from './areas'
import studentList from './fixtures/student-list.txt?raw'

const { drafts, format, warnings } = parseImport(studentList, NOW, 'student-list.txt')

const stepTitles = (d: TaskDraft | undefined): string[] => (d?.steps ?? []).map((s) => s.title)

/** Expected area id for each of the 33 lines, by position. */
const EXPECTED_AREAS: readonly string[] = [
  'projects', // 1  client realty website
  'projects', // 2  hackathon repo
  'projects', // 3  more hackathons
  'career', //   4  pitch competition
  'projects', // 5  canvas assignment tracker app
  'projects', // 6  Treehacks
  'career', //   7  Chik-fil-a Scholars
  'life', //     8  housing lottery
  'projects', // 9  publish games
  'learning', // 10 research project
  'projects', // 11 stanford dining app
  'projects', // 12 phasora app
  'career', //   13 linkedin
  'career', //   14 Handshake
  'career', //   15 portfolio
  'career', //   16 blinq digital card
  'career', //   17 employers
  'career', //   18 Career Center director
  'classes', //  19 CS380, CS303, MA252
  'career', //   20 internships
  'projects', // 21 Urdu learning app project
  'learning', // 22 Coursera
  'learning', // 23 Course certificates
  'learning', // 24 edx CS50
  'orgs', //     25 USGA website
  'orgs', //     26 USGA mentee
  'orgs', //     27 IM mentees
  'orgs', //     28 IM events
  'orgs', //     29 IM escape room
  'orgs', //     30 AI collective
  'orgs', //     31 ACM events
  'projects', // 32 Unity game
  'orgs', //     33 ambassador / volunteering
]

describe('student list fixture: parsing', () => {
  it('is detected as text and yields 33 drafts', () => {
    expect(format).toBe('text')
    expect(warnings).toEqual([])
    expect(drafts).toHaveLength(33)
  })

  it('strips the numbering and trailing periods from titles', () => {
    expect(drafts[0]?.title).toBe(
      'Fully setup the client realty website and add domains and upload sitemap to google',
    )
    expect(drafts[27]?.title).toBe('Submit absence request forms for IM events')
    expect(drafts.every((d) => !/^\d+[.)]/.test(d.title) && !d.title.endsWith('.'))).toBe(true)
  })

  it('splits #7 into a title and two steps', () => {
    expect(drafts[6]?.title).toBe('Apply for Chik-fil-a Scholars')
    expect(stepTitles(drafts[6])).toEqual(['Get rec letter', 'Research the application'])
  })

  it('splits #9 into a title and two steps', () => {
    expect(drafts[8]?.title).toBe('Publish the 2 online games I made')
    expect(stepTitles(drafts[8])).toEqual(['On github', 'Update resume and portfolio'])
  })

  it('splits #15 into a title and three steps, keeping "#1" literal', () => {
    expect(drafts[14]?.title).toBe('Update my portfolio')
    expect(stepTitles(drafts[14])).toEqual([
      'Make a fully new revamped portfolio',
      'Updated information',
      'Add hackathon #1 place',
    ])
    expect(drafts[14]?.area).toBeUndefined()
  })

  it('keeps line 30 (no colon) as a single title', () => {
    expect(drafts[29]?.title).toBe('Plan the AI collective events, create powerpoints, meet with the board')
    expect(drafts[29]?.steps ?? []).toEqual([])
  })

  it('only the three colon lines get steps', () => {
    const withSteps = drafts.flatMap((d, i) => ((d.steps ?? []).length > 0 ? [i + 1] : []))
    expect(withSteps).toEqual([7, 9, 15])
  })

  it('produces no due dates, areas, priorities or other fields', () => {
    for (const d of drafts) {
      expect(d.due).toBeUndefined()
      expect(d.area).toBeUndefined()
      expect(d.high).toBeUndefined()
      expect(d.horizon).toBeUndefined()
      expect(d.effort).toBeUndefined()
      expect(d.notes).toBeUndefined()
    }
  })

  it('does not parse dates out of "as soon as its out", "semester" or "CS50"', () => {
    for (const i of [8, 31, 24]) expect(drafts[i - 1]?.due).toBeUndefined()
  })
})

describe('student list fixture: area classification', () => {
  const resolved = (useSteps: boolean): string[] =>
    drafts.map((d) => {
      const text = useSteps ? [d.title, ...stepTitles(d)].join(' ') : d.title
      return resolveArea(d.area, text, DEFAULT_AREAS).areaId
    })

  it('has an expectation for every line', () => {
    expect(EXPECTED_AREAS).toHaveLength(33)
  })

  it('classifies every line as expected from the title alone', () => {
    const actual = resolved(false)
    const misses = actual.flatMap((id, i) => (id === EXPECTED_AREAS[i] ? [] : [`#${i + 1}: ${id} != ${EXPECTED_AREAS[i]}`]))
    expect(misses).toEqual([])
  })

  it('classifies every line as expected from title plus steps', () => {
    const actual = resolved(true)
    const misses = actual.flatMap((id, i) => (id === EXPECTED_AREAS[i] ? [] : [`#${i + 1}: ${id} != ${EXPECTED_AREAS[i]}`]))
    expect(misses).toEqual([])
  })

  it('lands at least 30 of 33 in the expected area', () => {
    const hits = resolved(false).filter((id, i) => id === EXPECTED_AREAS[i]).length
    expect(hits).toBeGreaterThanOrEqual(30)
  })

  it.each([
    ['Coursera AI courses', 'learning'],
    ['Harvard edx CS50 courses', 'learning'],
    ['Catch up in CS380, CS303 and MA252 work', 'classes'],
    ['Develop a stanford dining app', 'projects'],
    ['Apply for internships on handshake', 'career'],
    ['Plan ACM events for the semester', 'orgs'],
    ['Apply for housing lottery as soon as its out', 'life'],
    [
      'Set up a research project in claude so I can start working on my physics lab research in there',
      'learning',
    ],
    ['Sign up for the campus pitch competition', 'career'],
    ['Apply for Treehacks', 'projects'],
    ['Update my portfolio', 'career'],
    ['Publish the 2 online games I made', 'projects'],
  ])('%s -> %s', (text, id) => {
    expect(resolveArea(undefined, text, DEFAULT_AREAS)).toEqual({ areaId: id, guessed: true })
  })
})
