import { EFFORT_LABEL, HORIZON_LABEL, HORIZONS } from '../model/types'
import type { Area, Effort, Horizon, TaskDraft } from '../model/types'
import { matchAreaHint } from './classify'
import { formatDue, parseDateToken } from './dates'

export interface Chip {
  kind: 'area' | 'due' | 'horizon' | 'high' | 'effort'
  label: string
}

export interface CaptureResult {
  draft: TaskDraft
  chips: Chip[]
}

/** Maps a `#hint` to the area label to store, or null if the hint is not usable. */
export type HintResolver = (hint: string) => string | null

interface TokenState {
  kept: string[]
  area?: string
  high: boolean
  horizon?: Horizon
  effort?: Effort
}

const AREA_TOKEN = /^#([A-Za-z][\w-]*)$/ // "#1" is never a tag
const HIGH_TOKEN = /^(?:!{1,2}|!high)$/i
const HORIZON_TOKEN = new RegExp(`^@(${HORIZONS.join('|')})$`, 'i')
const EFFORT_TOKEN = /^~(s|small|quick|m|med|medium|l|large|big)$/i
const LEADING_PREPOSITION = /\b(?:on|by|before|until)\s+$/i

const EFFORT_BY_WORD: Record<string, Effort> = {
  s: 's',
  small: 's',
  quick: 's',
  m: 'm',
  med: 'm',
  medium: 'm',
  l: 'l',
  large: 'l',
  big: 'l',
}

/** Longer lines are cut before parsing; no real task title is this long. */
export const MAX_LINE_CHARS = 2000

/** Applies one whitespace-delimited token to the state; unrecognized tokens stay in the title. */
function applyToken(state: TokenState, token: string, resolveHint: HintResolver): TokenState {
  const areaHint = AREA_TOKEN.exec(token)?.[1]
  if (areaHint !== undefined) {
    const label = resolveHint(areaHint)
    if (label !== null) return { ...state, area: state.area ?? label }
  }
  if (HIGH_TOKEN.test(token)) return { ...state, high: true }
  const horizonWord = HORIZON_TOKEN.exec(token)?.[1]
  if (horizonWord !== undefined) {
    return { ...state, horizon: state.horizon ?? (horizonWord.toLowerCase() as Horizon) }
  }
  const effortWord = EFFORT_TOKEN.exec(token)?.[1]
  if (effortWord !== undefined) {
    return { ...state, effort: state.effort ?? EFFORT_BY_WORD[effortWord.toLowerCase()] }
  }
  // Appends in place: `kept` is a fresh array owned by extractCapture, and copying it per
  // word made long lines quadratic (a crafted import line could freeze the tab).
  state.kept.push(token)
  return state
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** Removes the first date phrase (and a directly preceding "on"/"by") unless that empties the title. */
function splitDate(title: string, now: Date): { title: string; due?: string } {
  const hit = parseDateToken(title, now)
  if (hit === null) return { title }
  const start = title.indexOf(hit.match)
  const before = title.slice(0, start).replace(LEADING_PREPOSITION, '')
  const stripped = collapse(`${before} ${title.slice(start + hit.match.length)}`)
  return { title: stripped === '' ? title : stripped, due: hit.due }
}

function buildChips(draft: TaskDraft, now: Date): Chip[] {
  const chips: Chip[] = []
  if (draft.area !== undefined) chips.push({ kind: 'area', label: draft.area })
  if (draft.due) chips.push({ kind: 'due', label: formatDue(draft.due, now) })
  if (draft.horizon !== undefined) chips.push({ kind: 'horizon', label: HORIZON_LABEL[draft.horizon] })
  if (draft.high) chips.push({ kind: 'high', label: 'High priority' })
  if (draft.effort !== undefined) chips.push({ kind: 'effort', label: EFFORT_LABEL[draft.effort] })
  return chips
}

/**
 * Parses quick-capture tokens out of one line. `resolveHint` decides what a
 * `#word` means: capture resolves it against the user's areas; importers keep
 * the word as written and let the commit step resolve it.
 */
export function extractCapture(input: string, now: Date, resolveHint: HintResolver): CaptureResult {
  const words = input.slice(0, MAX_LINE_CHARS).split(/\s+/).filter((w) => w !== '')
  let state: TokenState = { kept: [], high: false }
  for (const word of words) state = applyToken(state, word, resolveHint)
  const { title, due } = splitDate(state.kept.join(' '), now)
  const draft: TaskDraft = {
    title,
    ...(state.area !== undefined && { area: state.area }),
    ...(due !== undefined && { due }),
    ...(state.horizon !== undefined && { horizon: state.horizon }),
    ...(state.high && { high: true }),
    ...(state.effort !== undefined && { effort: state.effort }),
  }
  return { draft, chips: buildChips(draft, now) }
}

/** Quick-capture line parser. `#area` hints must resolve against `areas` or they stay in the title. */
export function parseCapture(input: string, areas: Area[], now: Date): CaptureResult {
  return extractCapture(input, now, (hint) => matchAreaHint(hint, areas)?.name ?? null)
}
