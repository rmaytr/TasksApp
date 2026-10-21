import type { Area } from './types'

export const DEFAULT_AREAS: readonly Area[] = [
  { id: 'classes', name: 'Classes', color: 'indigo' },
  { id: 'orgs', name: 'Orgs', color: 'magenta' },
  { id: 'career', name: 'Career', color: 'teal' },
  { id: 'projects', name: 'Projects', color: 'amber' },
  { id: 'learning', name: 'Learning', color: 'violet' },
  { id: 'life', name: 'Life', color: 'olive' },
]

export const MAX_AREAS = 8

/** A short, generic list a first-time visitor can load to see the radar populated. */
export const SAMPLE_TEXT = `Classes:
- Finish problem set 4 for calculus fri
- Read chapters 6–7 for history @week
- Study for the biology midterm nov 14 !
Orgs:
- Book a room for the club social: email facilities, send the poll
- Make slides for Thursday's board meeting
Career:
- Update resume with summer internship ~m
- Apply to 3 internships: tailor cover letter, ask for a referral, submit !
- Coffee chat with alumni from the career fair @month
Projects:
- Ship the portfolio site: write the about page, add two projects, buy a domain
- Prototype the habit tracker idea @someday
Learning:
- Finish week 2 of the machine learning course @week
Life:
- Renew passport @later
- Call home this weekend`
