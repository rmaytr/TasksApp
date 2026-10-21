import { z } from 'zod'
import { HORIZONS } from '../../model/types'
import type { TaskDraft } from '../../model/types'
import {
  MAX_AREA_HINT,
  MAX_NOTES,
  MAX_STEPS,
  MAX_STEP,
  MAX_TITLE,
  isHighPriority,
  isTruthy,
  normalizeDue,
  type ImportResult,
} from './shared'

const MAX_SHORT_FIELD = 300

const trimmed = (max: number): z.ZodType<string> => z.string().transform((s) => s.trim().slice(0, max))
const nonEmpty = (max: number): z.ZodType<string> => trimmed(max).refine((s) => s.length > 0)

const stepSchema = z.object({ title: nonEmpty(MAX_STEP), done: z.boolean() })

const draftSchema = z.object({
  title: nonEmpty(MAX_TITLE),
  notes: trimmed(MAX_NOTES).optional(),
  area: nonEmpty(MAX_AREA_HINT).optional(),
  horizon: z.enum(HORIZONS).optional().catch(undefined),
  due: z.string().nullable().optional(),
  high: z.boolean().optional(),
  effort: z.enum(['s', 'm', 'l']).optional().catch(undefined),
  waiting: trimmed(MAX_SHORT_FIELD).nullable().optional(),
  plan: trimmed(MAX_SHORT_FIELD).nullable().optional(),
  steps: z.array(stepSchema).optional(),
  done: z.boolean().optional(),
})

type Item = Record<string, unknown>

const isItem = (v: unknown): v is Item => typeof v === 'object' && v !== null && !Array.isArray(v)

const hasOwn = (o: Item, key: string): boolean => Object.hasOwn(o, key)

/** First alias holding a non-empty value. */
function pick(o: Item, keys: readonly string[]): unknown {
  const key = keys.find((k) => hasOwn(o, k) && o[k] !== undefined && o[k] !== null && o[k] !== '')
  return key === undefined ? undefined : o[key]
}

/** Like pick, but an explicit null counts (so "no due date" survives a round trip). */
function pickNullable(o: Item, keys: readonly string[]): unknown {
  const key = keys.find((k) => hasOwn(o, k) && o[k] !== undefined)
  return key === undefined ? undefined : o[key]
}

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

const asNullableString = (v: unknown): string | null | undefined => (v === null ? null : asString(v))

function normalizeSteps(value: unknown): { title: unknown; done: boolean }[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.slice(0, MAX_STEPS).flatMap((entry: unknown) => {
    if (typeof entry === 'string') return [{ title: entry, done: false }]
    if (!isItem(entry)) return []
    const title = pick(entry, ['title', 'name', 'text', 'content'])
    return [{ title, done: isTruthy(pick(entry, ['done', 'completed', 'checked'])) }]
  }).filter((s) => typeof s.title === 'string' && s.title.trim() !== '')
}

function normalizeArea(o: Item, areaNames: ReadonlyMap<string, string>): unknown {
  const id = asString(o['areaId'])
  if (id !== undefined && hasOwn(o, 'areaId')) return areaNames.get(id) ?? id
  const value = pick(o, ['area', 'category', 'list', 'project'])
  return isItem(value) ? pick(value, ['name', 'title']) : value
}

function normalizeItem(o: Item, now: Date, areaNames: ReadonlyMap<string, string>): Item {
  const priority = pick(o, ['high', 'priority'])
  const done = pick(o, ['done', 'completed', 'checked'])
  const dueRaw = pickNullable(o, ['due', 'deadline', 'dueDate', 'date'])
  return {
    title: pick(o, ['title', 'name', 'content', 'text']),
    notes: asString(pick(o, ['notes', 'description'])),
    area: normalizeArea(o, areaNames),
    horizon: o['horizon'],
    due: dueRaw === null ? null : normalizeDue(dueRaw, now),
    high: priority === undefined ? undefined : isHighPriority(priority),
    effort: o['effort'],
    waiting: asNullableString(pickNullable(o, ['waiting'])),
    plan: asNullableString(pickNullable(o, ['plan'])),
    steps: normalizeSteps(pick(o, ['steps', 'subtasks', 'checklist', 'children'])),
    done: done === undefined ? undefined : isTruthy(done),
  }
}

function toDraft(raw: unknown, now: Date, areaNames: ReadonlyMap<string, string>): TaskDraft | null {
  const item: Item | null = typeof raw === 'string' ? { title: raw } : isItem(raw) ? raw : null
  if (item === null) return null
  const parsed = draftSchema.safeParse(normalizeItem(item, now, areaNames))
  return parsed.success ? parsed.data : null
}

function areaNameMap(areas: unknown): Map<string, string> {
  const map = new Map<string, string>()
  if (!Array.isArray(areas)) return map
  for (const a of areas) {
    if (isItem(a) && typeof a['id'] === 'string' && typeof a['name'] === 'string') map.set(a['id'], a['name'])
  }
  return map
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON. Check for a missing comma or bracket and try again.')
  }
}

function unwrap(root: unknown): { items: unknown[]; areaNames: Map<string, string> } {
  if (Array.isArray(root)) return { items: root, areaNames: new Map() }
  if (isItem(root) && Array.isArray(root['tasks'])) {
    const fromNearer = root['app'] === 'nearer'
    return { items: root['tasks'], areaNames: fromNearer ? areaNameMap(root['areas']) : new Map() }
  }
  throw new Error('Could not find a list of tasks in this JSON. Expected an array or an object like {"tasks": [...]}.')
}

export function parseJson(text: string, now: Date): ImportResult {
  const { items, areaNames } = unwrap(parseJsonText(text))
  const drafts = items.flatMap((raw) => {
    const draft = toDraft(raw, now, areaNames)
    return draft === null ? [] : [draft]
  })
  const skipped = items.length - drafts.length
  const warnings = skipped > 0 ? [`Skipped ${skipped} item${skipped === 1 ? '' : 's'} that could not be read as tasks.`] : []
  return { drafts, warnings }
}
