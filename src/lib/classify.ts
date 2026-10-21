import type { Area } from '../model/types'

/**
 * Keyword classification of tasks into areas.
 *
 * Each rule adds its weight to its area when it matches (once per rule). The
 * area with the highest total wins; ties go to the fixed AREA_ORDER. Rules are
 * matched against default area NAMES, so renamed or removed areas still work.
 */

interface Rule {
  re: RegExp
  weight: number
}

const rule = (re: RegExp, weight: number): Rule => ({ re, weight })

const WEIGHTED_RULES: Record<string, Rule[]> = {
  Classes: [
    rule(/\b[A-Z]{2,4}\s?\d{3}\b/, 6), // CS380, MA252, PH 222 (case-sensitive on purpose)
    rule(/\bhomework\b/i, 5),
    rule(/\b(?:exams?|quiz(?:zes)?|midterms?)\b/i, 5),
    rule(/\blab reports?\b/i, 5),
    rule(/\bsyllabus\b/i, 5),
    rule(/\bassignments?\b/i, 4),
    rule(/\blectures?\b/i, 4),
    rule(/\bclass(?:es)?\b/i, 3),
    rule(/\bcatch(?:ing)? up\b/i, 3),
  ],
  Orgs: [
    rule(/\bAI collective\b/i, 6),
    rule(/\b(?:ACM|USGA)\b/i, 5),
    rule(/\bescape room\b/i, 5),
    rule(/\babsence requests?\b/i, 5),
    rule(/\bmeeting with the board\b/i, 5),
    rule(/\binternational mentors\b/i, 5),
    rule(/\bIM\b/, 4), // upper-case only, so "im" never fires
    rule(/\bmentees?\b/i, 4),
    rule(/\bambassadors?\b/i, 4),
    rule(/\bvolunteer(?:s|ed|ing)?\b/i, 4),
    rule(/\bclubs?\b/i, 4),
    rule(/\borgs?\b/i, 3),
    rule(/\bchapter\b/i, 3),
    rule(/\bboard\b/i, 3),
    rule(/\bevents?\b/i, 3),
    rule(/\bmentors?\b/i, 3),
    rule(/\bpower ?points?\b/i, 3),
  ],
  Career: [
    rule(/\b(?:internships?|linkedin|handshake|recruiters?|blinq|interviews?)\b/i, 5),
    rule(/\bportfolio\b/i, 5),
    rule(/\bcareer center\b/i, 5),
    rule(/\bcover letters?\b/i, 5),
    rule(/\bpitch competitions?\b/i, 5),
    rule(/\b(?:employers?|digital card|networking|scholar(?:s|ship|ships)?)\b/i, 4),
    rule(/\bresume\b/i, 3),
    rule(/\bapplications?\b/i, 3),
    rule(/\breach(?:ing)? out\b/i, 3),
    rule(/\b(?:career|jobs?)\b/i, 3),
    rule(/\bappl(?:y|ying)\b/i, 2),
  ],
  Projects: [
    rule(/\bunity\b/i, 5),
    rule(/\b(?:treehacks|hackmit|hacktx|calhacks|hackutd|hackgt|pennapps)\b/i, 4),
    rule(/\bapps?\b/i, 5),
    rule(/\bpublish(?:ed|ing)?\b/i, 4),
    rule(/\bprototypes?\b/i, 4),
    rule(/\bwebsites?\b/i, 3),
    rule(/\b(?:repos?|repositor(?:y|ies))\b/i, 3),
    rule(/\bgithub\b/i, 3),
    rule(/\bgames?\b/i, 3),
    rule(/\bhackathons?\b/i, 3),
    rule(/\b(?:build|building|develop|developing|ship|shipping)\b/i, 3),
    rule(/\b(?:domains?|sitemap|deploy(?:ing)?)\b/i, 2),
    rule(/\b(?:code|coding)\b/i, 2),
    rule(/\bprojects?\b/i, 1),
  ],
  Learning: [
    rule(/\b(?:coursera|edx|udemy)\b/i, 6),
    rule(/\bresearch projects?\b/i, 6),
    rule(/\bcs50\b/i, 5),
    rule(/\b(?:certificates?|certifications?)\b/i, 4),
    rule(/\btutorials?\b/i, 4),
    rule(/\bcourses?\b/i, 3),
    rule(/\blearn(?:ing|s)?\b/i, 3),
    rule(/\bstud(?:y|ying)\b/i, 3),
    rule(/\bresearch\b/i, 2),
  ],
  Life: [
    rule(/\bgreen ?card\b/i, 6),
    rule(/\blottery\b/i, 5),
    rule(/\b(?:visa|doctor|dentist|groceries|laundry|taxes|gym)\b/i, 4),
    rule(/\brent\b/i, 3),
    rule(/\bbuy\b/i, 2),
  ],
}

/** Public, weight-free view of the default keywords, keyed by default area name. */
export const DEFAULT_AREA_KEYWORDS: Record<string, RegExp[]> = Object.fromEntries(
  Object.entries(WEIGHTED_RULES).map(([name, rules]) => [name, rules.map((r) => r.re)]),
)

/** Tie-break order, and the order custom areas are listed after. */
const AREA_ORDER = ['classes', 'orgs', 'career', 'projects', 'learning', 'life']

/**
 * A literal mention of a custom area's own name ("Gym") is a stronger signal than
 * any keyword. Default areas skip this: their names ("Learning") are too common
 * in ordinary phrasing ("a learning app") and their keyword rules already cover them.
 */
const NAME_MATCH_WEIGHT = 10

const SYNONYMS: Record<string, string> = {
  school: 'classes',
  course: 'classes',
  uni: 'classes',
  club: 'orgs',
  clubs: 'orgs',
  org: 'orgs',
  job: 'career',
  jobs: 'career',
  work: 'career',
  project: 'projects',
  side: 'projects',
  study: 'learning',
  learn: 'learning',
  personal: 'life',
  home: 'life',
}

const MIN_PREFIX_LENGTH = 3
const DEFAULT_FALLBACK_AREA = 'life'

const norm = (s: string): string => s.trim().toLowerCase()

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function rulesForArea(area: Area): Rule[] {
  const key = Object.keys(WEIGHTED_RULES).find((name) => norm(name) === norm(area.name))
  return key === undefined ? [] : (WEIGHTED_RULES[key] ?? [])
}

function nameMentionScore(area: Area, text: string): number {
  const name = area.name.trim()
  if (name === '') return 0
  const re = new RegExp(`(?<![\\w])${escapeRegExp(name)}(?![\\w])`, 'i')
  return re.test(text) ? NAME_MATCH_WEIGHT : 0
}

function scoreArea(area: Area, text: string): number {
  const rules = rulesForArea(area)
  if (rules.length === 0) return nameMentionScore(area, text)
  return rules.reduce((sum, r) => (r.re.test(text) ? sum + r.weight : sum), 0)
}

function tieBreakRank(area: Area, index: number): number {
  const known = AREA_ORDER.indexOf(norm(area.name))
  return known >= 0 ? known : AREA_ORDER.length + index
}

/** Returns the id of the best-scoring area, or null when nothing matches. */
export function guessArea(text: string, areas: Area[]): string | null {
  const scored = areas
    .map((area, index) => ({ area, score: scoreArea(area, text), rank: tieBreakRank(area, index) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
  return scored[0]?.area.id ?? null
}

/**
 * Resolves a user-written hint (`#proj`, "Career", an id) to an area:
 * exact id/name, then a name prefix of 3+ characters, then a synonym.
 */
export function matchAreaHint(hint: string, areas: Area[]): Area | null {
  const h = norm(hint).replace(/^#/, '')
  if (h === '') return null
  const exact = areas.find((a) => norm(a.id) === h || norm(a.name) === h)
  if (exact) return exact
  if (h.length >= MIN_PREFIX_LENGTH) {
    const prefixed = areas.find((a) => norm(a.name).startsWith(h))
    if (prefixed) return prefixed
  }
  const synonym = SYNONYMS[h]
  return synonym === undefined ? null : (areas.find((a) => norm(a.name) === synonym) ?? null)
}

/** Picks an area for a task: the hint if it resolves, else a keyword guess, else Life / first area. */
export function resolveArea(
  hint: string | undefined,
  text: string,
  areas: Area[],
): { areaId: string; guessed: boolean } {
  const direct = hint === undefined ? null : matchAreaHint(hint, areas)
  if (direct) return { areaId: direct.id, guessed: false }
  const guess = guessArea(text, areas)
  if (guess !== null) return { areaId: guess, guessed: true }
  const life = areas.find((a) => norm(a.name) === DEFAULT_FALLBACK_AREA)
  return { areaId: life?.id ?? areas[0]?.id ?? '', guessed: true }
}
