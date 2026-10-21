import type { TaskDraft } from '../../model/types'
import { fromISODate, parseDateToken, toISODate } from '../dates'

export const MAX_TITLE = 300
export const MAX_STEP = 300
export const MAX_NOTES = 5000
export const MAX_AREA_HINT = 100
/** Steps kept per task; also keeps repeated step appends cheap on huge inputs. */
export const MAX_STEPS = 200

export interface ImportResult {
  drafts: TaskDraft[]
  warnings: string[]
}

export const collapseSpaces = (s: string): string => s.replace(/\s+/g, ' ').trim()

export const clamp = (s: string, max: number): string => s.trim().slice(0, max)

export const capitalize = (s: string): string => (s === '' ? s : s.charAt(0).toUpperCase() + s.slice(1))

/** Drops trailing dots and whitespace with a linear scan (the regex form backtracked on long dot runs). */
export function stripTrailingPeriod(s: string): string {
  let end = s.trimEnd().length
  while (end > 0 && s[end - 1] === '.') end -= 1
  return s.slice(0, end).trim()
}

export function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toISODate(fromISODate(value)) === value
}

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'x', 'done'])
const HIGH_PRIORITY = new Set(['high', 'p1', '1', 'urgent', 'true', 'yes'])

/** Loose boolean for "done"-style cells and JSON values. */
export function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  return typeof value === 'string' && TRUTHY.has(value.trim().toLowerCase())
}

/** Loose "is this high priority" for JSON values and generic CSV cells (p1 / 1 / urgent / high). */
export function isHighPriority(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  return typeof value === 'string' && HIGH_PRIORITY.has(value.trim().toLowerCase())
}

/**
 * Turns a free-form due value into an ISO day. Accepts ISO dates and datetimes,
 * and natural phrases; ignores recurrence rules ("every friday") and junk.
 */
export function normalizeDue(value: unknown, now: Date): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text === '' || /^every\b/i.test(text)) return undefined
  const isoPrefix = /^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/.exec(text)?.[1]
  if (isoPrefix !== undefined) return isValidISODate(isoPrefix) ? isoPrefix : undefined
  return parseDateToken(text, now)?.due
}

/** Returns a copy of the draft with one more step, or null when it already has MAX_STEPS. */
export function appendStep(draft: TaskDraft, step: { title: string; done: boolean }): TaskDraft | null {
  const steps = draft.steps ?? []
  return steps.length >= MAX_STEPS ? null : { ...draft, steps: [...steps, step] }
}

export function droppedStepsWarning(count: number): string[] {
  return count > 0 ? [`Dropped ${count} step${count === 1 ? '' : 's'} beyond the ${MAX_STEPS}-step limit per task.`] : []
}
