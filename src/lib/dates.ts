import { HORIZONS } from '../model/types'
import type { Horizon } from '../model/types'

/**
 * Date helpers. Every date is a LOCAL calendar day written `YYYY-MM-DD`.
 * Anything that depends on "now" takes it as a parameter.
 */

const MS_PER_DAY = 86_400_000
/** A month/day phrase more than this many days in the past rolls to next year. */
const ROLL_FORWARD_AFTER_DAYS = 30

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

export function toISODate(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local midnight of the given ISO day. */
export function fromISODate(iso: string): Date {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, n: number): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + n))
}

/** Whole calendar days from `fromIso` to `toIso`; DST-safe because it works in UTC. */
export function daysBetween(fromIso: string, toIso: string): number {
  const toUtc = (iso: string): number => {
    const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / MS_PER_DAY)
}

export function todayISO(now: Date): string {
  return toISODate(now)
}

/* ------------------------------ natural language ------------------------------ */

interface Candidate {
  index: number
  match: string
  due: string
}

type Finder = (text: string, now: Date) => Candidate[]

const WORD_START = '(?<![\\w#@])'
const NUM_START = '(?<![\\w/.-])'
const MONTHS =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const WEEKDAYS = 'mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?'
const OPTIONAL_YEAR = '(?:,?\\s+(20\\d{2})(?!\\w))?'

function isRealDate(y: number, m: number, d: number): boolean {
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

function isoFromParts(y: number, m: number, d: number): string | null {
  return isRealDate(y, m, d) ? `${pad(y, 4)}-${pad(m)}-${pad(d)}` : null
}

/** Month + day (+ optional year). Without a year, picks this year unless it is long past. */
function resolveMonthDay(month: number, day: number, year: number | undefined, now: Date): string | null {
  if (year !== undefined) return isoFromParts(year, month, day)
  const thisYear = now.getFullYear()
  const candidate = isoFromParts(thisYear, month, day)
  if (candidate === null) return null
  return daysBetween(candidate, todayISO(now)) > ROLL_FORWARD_AFTER_DAYS
    ? isoFromParts(thisYear + 1, month, day)
    : candidate
}

function monthNumber(name: string): number {
  return MONTH_SHORT.findIndex((m) => m.toLowerCase() === name.slice(0, 3).toLowerCase()) + 1
}

function weekdayNumber(name: string): number {
  return WEEKDAY_SHORT.findIndex((w) => w.toLowerCase() === name.slice(0, 3).toLowerCase())
}

function scan(text: string, pattern: RegExp, build: (m: RegExpMatchArray) => string | null): Candidate[] {
  const found: Candidate[] = []
  for (const m of text.matchAll(pattern)) {
    const due = build(m)
    if (due !== null) found.push({ index: m.index, match: m[0], due })
  }
  return found
}

const findRelativeWords: Finder = (text, now) =>
  scan(text, new RegExp(`${WORD_START}(today|tonight|tomorrow|tmrw)(?!\\w)`, 'gi'), (m) => {
    const word = (m[1] ?? '').toLowerCase()
    return addDays(todayISO(now), word === 'tomorrow' || word === 'tmrw' ? 1 : 0)
  })

/** Monday (0) .. Sunday (6). */
const mondayIndex = (d: Date): number => (d.getDay() + 6) % 7

const nextMonday = (now: Date): string => addDays(todayISO(now), 7 - mondayIndex(now))

/** Days from today until the coming Saturday; on a Sunday the weekend is already here (0). */
const daysToWeekend = (now: Date): number => (now.getDay() === 0 ? 0 : 6 - now.getDay())

/**
 * "this weekend" / "weekend" / "on the weekend": the coming Saturday (today on Sat or Sun).
 * "next weekend": the Saturday after that one (from Sat/Sun: the following Saturday).
 * A possessive ("weekend's chores") or longer word ("weekender") is not a date.
 */
const findWeekend: Finder = (text, now) =>
  scan(
    text,
    new RegExp(`${WORD_START}(?:(next)\\s+|(?:on\\s+)?the\\s+|this\\s+)?weekend(?![\\w'’])`, 'gi'),
    (m) => {
      const thisWeekend = daysToWeekend(now)
      // From Sunday the "coming" Saturday is yesterday, so the next one is 6 days out.
      const days = m[1] ? (now.getDay() === 0 ? 6 : thisWeekend + 7) : thisWeekend
      return addDays(todayISO(now), days)
    },
  )

/** "end of week" / "eow": this Friday (today on Friday; from Sat/Sun, next Friday). */
const findEndOfWeek: Finder = (text, now) =>
  scan(
    text,
    new RegExp(`${WORD_START}(?:by\\s+(?:the\\s+)?)?(?:end\\s+of\\s+(?:the\\s+)?week|eow)(?!\\w)`, 'gi'),
    () => addDays(todayISO(now), (5 - now.getDay() + 7) % 7),
  )

/** "end of day" / "eod": today. */
const findEndOfDay: Finder = (text, now) =>
  scan(
    text,
    new RegExp(`${WORD_START}(?:by\\s+(?:the\\s+)?)?(?:end\\s+of\\s+(?:the\\s+)?day|eod)(?!\\w)`, 'gi'),
    () => todayISO(now),
  )

const findNextWeek: Finder = (text, now) =>
  scan(text, new RegExp(`${WORD_START}next\\s+week(?!\\w)`, 'gi'), () => nextMonday(now))

/**
 * "fri" / "friday": the next occurrence; the same weekday as today means today.
 * "next fri": that weekday in the FOLLOWING calendar week (Mon-Sun), so on a
 * Wednesday "next monday" is 5 days away and "next friday" is 9 days away.
 */
const findWeekdays: Finder = (text, now) =>
  // A possessive ("Thursday's meeting") names an event, not a due date.
  scan(text, new RegExp(`${WORD_START}(?:(next)\\s+)?(${WEEKDAYS})(?![\\w'’])`, 'gi'), (m) => {
    const target = weekdayNumber(m[2] ?? '')
    if (m[1]) return addDays(nextMonday(now), (target + 6) % 7)
    return addDays(todayISO(now), (target - now.getDay() + 7) % 7)
  })

const findInDuration: Finder = (text, now) =>
  scan(text, new RegExp(`${WORD_START}in\\s+(\\d{1,3})\\s+(day|week)s?(?!\\w)`, 'gi'), (m) => {
    const unit = (m[2] ?? '').toLowerCase() === 'week' ? 7 : 1
    return addDays(todayISO(now), Number(m[1]) * unit)
  })

const findEndOfMonth: Finder = (text, now) =>
  scan(text, new RegExp(`${WORD_START}(?:end\\s+of\\s+(?:the\\s+)?month|eom)(?!\\w)`, 'gi'), () =>
    toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  )

const findMonthThenDay: Finder = (text, now) =>
  scan(
    text,
    new RegExp(`${WORD_START}(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\w)(?!:\\d)${OPTIONAL_YEAR}`, 'gi'),
    (m) => resolveMonthDay(monthNumber(m[1] ?? ''), Number(m[2]), m[3] ? Number(m[3]) : undefined, now),
  )

const findDayThenMonth: Finder = (text, now) =>
  scan(
    text,
    new RegExp(`${NUM_START}(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTHS})(?!\\w)${OPTIONAL_YEAR}`, 'gi'),
    (m) => resolveMonthDay(monthNumber(m[2] ?? ''), Number(m[1]), m[3] ? Number(m[3]) : undefined, now),
  )

const findNumeric: Finder = (text, now) =>
  scan(text, new RegExp(`${NUM_START}(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?(?![\\w/])`, 'g'), (m) => {
    const rawYear = m[3]
    const year = rawYear === undefined ? undefined : rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear)
    return resolveMonthDay(Number(m[1]), Number(m[2]), year, now)
  })

const findISO: Finder = (text) =>
  scan(text, /(?<![\w-])(\d{4})-(\d{2})-(\d{2})(?![\w-])/g, (m) => isoFromParts(Number(m[1]), Number(m[2]), Number(m[3])))

const FINDERS: readonly Finder[] = [
  findRelativeWords,
  findNextWeek,
  findWeekend,
  findEndOfWeek,
  findEndOfDay,
  findWeekdays,
  findInDuration,
  findEndOfMonth,
  findMonthThenDay,
  findDayThenMonth,
  findNumeric,
  findISO,
]

function earliest(candidates: Candidate[]): Candidate | null {
  return candidates.reduce<Candidate | null>((best, c) => {
    if (best === null) return c
    if (c.index !== best.index) return c.index < best.index ? c : best
    return c.match.length > best.match.length ? c : best
  }, null)
}

/** Extends a match leftwards over a literal "due " / "due:" prefix. */
function withDuePrefix(text: string, hit: Candidate): { due: string; match: string } {
  const prefix = /(?<!\w)due(?::\s*|\s+)$/i.exec(text.slice(0, hit.index))
  const start = prefix ? prefix.index : hit.index
  return { due: hit.due, match: text.slice(start, hit.index + hit.match.length) }
}

/**
 * Finds the FIRST date phrase in free text. Returns the ISO day and the exact
 * substring matched (including a leading "due"/"due:"), or null.
 */
export function parseDateToken(text: string, now: Date): { due: string; match: string } | null {
  const hit = earliest(FINDERS.flatMap((find) => find(text, now)))
  return hit === null ? null : withDuePrefix(text, hit)
}

/* --------------------------------- horizons --------------------------------- */

/** Overdue or today -> today; within 7 days -> week; within 31 -> month; otherwise none. */
export function horizonForDue(due: string | null, now: Date): Horizon | null {
  if (due === null) return null
  const days = daysBetween(todayISO(now), due)
  if (days <= 0) return 'today'
  if (days <= 7) return 'week'
  if (days <= 31) return 'month'
  return null
}

/** The nearer of two horizons, by HORIZONS order. */
export function nearerHorizon(a: Horizon, b: Horizon | null): Horizon {
  if (b === null) return a
  return HORIZONS.indexOf(b) < HORIZONS.indexOf(a) ? b : a
}

/* ---------------------------------- display --------------------------------- */

/**
 * "Today", "Tomorrow", "Yesterday", otherwise weekday plus date so it's never ambiguous:
 * "Fri, Oct 23", "Mon, Oct 19", "Wed, Nov 3, 2027".
 */
export function formatDue(due: string, now: Date): string {
  const days = daysBetween(todayISO(now), due)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  const date = fromISODate(due)
  const label = `${WEEKDAY_SHORT[date.getDay()] ?? ''}, ${MONTH_SHORT[date.getMonth()] ?? ''} ${date.getDate()}`
  return date.getFullYear() === now.getFullYear() ? label : `${label}, ${date.getFullYear()}`
}

export type DueTone = 'overdue' | 'soon' | 'week' | 'later'

/** How close a deadline is, for color: past, today/tomorrow, within a week, further out. */
export function dueTone(due: string, now: Date): DueTone {
  const days = daysBetween(todayISO(now), due)
  if (days < 0) return 'overdue'
  if (days <= 1) return 'soon'
  return days <= 6 ? 'week' : 'later'
}
