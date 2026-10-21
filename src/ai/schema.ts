import { z } from 'zod'
import { HORIZONS } from '../model/types'
import { AiError } from './types'
import type { AiAnalyzeResult, AiContext, AiPlanResult, AiTaskSuggestion } from './types'

/*
 * Schemas for what the MODEL returns. They are written for Claude's structured outputs:
 * every field is required, absence is expressed with `nullable`, enums are closed and dates
 * are plain strings. Range limits are NOT expressed here (structured outputs ignore most of
 * them); `sanitizeAnalyze` / `sanitizePlan` enforce them on the way out instead.
 */

const PrioritySchema = z.enum(['high', 'normal', 'low'])
const EffortSchema = z.enum(['s', 'm', 'l'])
const HorizonSchema = z.enum(HORIZONS)

export const TaskSuggestionSchema = z.object({
  title: z.string(),
  area: z.string().nullable(),
  due: z.string().nullable(),
  horizon: HorizonSchema.nullable(),
  priority: PrioritySchema,
  effort: EffortSchema,
  steps: z.array(z.string()),
  notes: z.string().nullable(),
  waitingOn: z.string().nullable(),
  after: z.array(z.string()),
  blocks: z.array(z.string()),
  reason: z.string().nullable(),
})

export const AnalyzeModelSchema = z.object({ tasks: z.array(TaskSuggestionSchema) })

export const PlanModelSchema = z.object({
  order: z.array(z.object({ taskId: z.string(), reason: z.string() })),
  dependencies: z.array(z.object({ taskId: z.string(), after: z.array(z.string()) })),
  summary: z.string(),
})

export const LIMITS = {
  title: 200,
  step: 120,
  steps: 8,
  text: 200,
  tasks: 5,
  order: 200,
} as const

const MAX_YEARS_AHEAD = 3
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Trim and cut to `max` characters without splitting a surrogate pair (emoji). */
function clamp(value: string, max: number): string {
  const trimmed = value.trim()
  const chars = Array.from(trimmed)
  return chars.length <= max ? trimmed : chars.slice(0, max).join('').trimEnd()
}

function clampOrNull(value: string | null, max: number): string | null {
  if (value === null) return null
  const out = clamp(value, max)
  return out === '' ? null : out
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  return date.toISOString().slice(0, 10) === value ? date : null
}

/** Accept a due date only if it is a real calendar day from yesterday up to three years out. */
function sanitizeDue(due: string | null, today: string): string | null {
  if (due === null) return null
  const parsed = parseIsoDate(due.trim())
  const base = parseIsoDate(today)
  if (!parsed || !base) return null
  const earliest = new Date(base)
  earliest.setUTCDate(earliest.getUTCDate() - 1)
  const latest = new Date(base)
  latest.setUTCFullYear(latest.getUTCFullYear() + MAX_YEARS_AHEAD)
  return parsed >= earliest && parsed <= latest ? parsed.toISOString().slice(0, 10) : null
}

function resolveArea(area: string | null, areas: readonly string[]): string | null {
  if (area === null) return null
  const wanted = area.trim().toLowerCase()
  if (wanted === '') return null
  return areas.find((name) => name.trim().toLowerCase() === wanted) ?? null
}

function knownIds(ctx: AiContext): Set<string> {
  return new Set(ctx.openTasks.map((task) => task.id))
}

function sanitizeSteps(steps: readonly string[]): string[] {
  return steps
    .map((step) => clamp(step, LIMITS.step))
    .filter((step) => step !== '')
    .slice(0, LIMITS.steps)
}

function sanitizeTask(
  task: z.infer<typeof TaskSuggestionSchema>,
  ctx: AiContext,
  ids: ReadonlySet<string>,
  fallbackTitle: string,
): AiTaskSuggestion | null {
  const title = clamp(task.title, LIMITS.title) || clamp(fallbackTitle, LIMITS.title)
  if (title === '') return null

  const blocks = unique(task.blocks).filter((id) => ids.has(id))
  // An id on both sides is a contradiction; trust neither.
  const contradictory = new Set(task.after.filter((id) => blocks.includes(id)))
  return {
    title,
    area: resolveArea(task.area, ctx.areas),
    due: sanitizeDue(task.due, ctx.today),
    horizon: task.horizon,
    priority: task.priority,
    effort: task.effort,
    steps: sanitizeSteps(task.steps),
    notes: task.notes === null ? null : clampOrNull(task.notes, 2000),
    waitingOn: clampOrNull(task.waitingOn, LIMITS.text),
    after: unique(task.after).filter((id) => ids.has(id) && !contradictory.has(id)),
    blocks: blocks.filter((id) => !contradictory.has(id)),
    reason: clampOrNull(task.reason, LIMITS.text),
  }
}

function invalid(): AiError {
  return new AiError('The assistant returned something Cairn could not use.', 'invalid')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Turn untrusted model (or proxy) output into a safe suggestion list. Anything that does not
 * fit is dropped rather than repaired; throws `AiError('invalid')` if nothing is left.
 * `inputText` supplies the fallback title when the model returns an empty one.
 */
export function sanitizeAnalyze(raw: unknown, ctx: AiContext, inputText = ''): AiAnalyzeResult {
  if (!isRecord(raw) || !Array.isArray(raw.tasks)) throw invalid()
  const ids = knownIds(ctx)
  const tasks: AiTaskSuggestion[] = []
  for (const candidate of raw.tasks) {
    if (tasks.length >= LIMITS.tasks) break
    const parsed = TaskSuggestionSchema.safeParse(candidate)
    if (!parsed.success) continue
    const task = sanitizeTask(parsed.data, ctx, ids, inputText)
    if (task) tasks.push(task)
  }
  if (tasks.length === 0) throw invalid()
  return { tasks }
}

/** True when `from` can already reach `target` by following "after" edges. */
function reaches(edges: ReadonlyMap<string, Set<string>>, from: string, target: string): boolean {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (id === target) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const next of edges.get(id) ?? []) stack.push(next)
  }
  return false
}

function sanitizeDependencies(
  entries: readonly { taskId: string; after: readonly string[] }[],
  ids: ReadonlySet<string>,
): AiPlanResult['dependencies'] {
  const edges = new Map<string, Set<string>>()
  for (const entry of entries) {
    if (!ids.has(entry.taskId)) continue
    for (const dep of unique(entry.after)) {
      if (!ids.has(dep) || dep === entry.taskId) continue
      // taskId waits for dep; skip the edge if dep already (transitively) waits for taskId.
      if (reaches(edges, dep, entry.taskId)) continue
      const set = edges.get(entry.taskId) ?? new Set<string>()
      set.add(dep)
      edges.set(entry.taskId, set)
    }
  }
  return [...edges].map(([taskId, after]) => ({ taskId, after: [...after] }))
}

/** Same contract as `sanitizeAnalyze`, for "plan my day" output. */
export function sanitizePlan(raw: unknown, ctx: AiContext): AiPlanResult {
  const parsed = PlanModelSchema.safeParse(raw)
  if (!parsed.success) throw invalid()
  const ids = knownIds(ctx)

  const seen = new Set<string>()
  const order: AiPlanResult['order'] = []
  for (const item of parsed.data.order) {
    if (order.length >= LIMITS.order) break
    if (!ids.has(item.taskId) || seen.has(item.taskId)) continue
    seen.add(item.taskId)
    order.push({ taskId: item.taskId, reason: clamp(item.reason, LIMITS.text) })
  }

  const dependencies = sanitizeDependencies(parsed.data.dependencies, ids)
  if (order.length === 0 && dependencies.length === 0) throw invalid()
  return { order, dependencies, summary: clamp(parsed.data.summary, LIMITS.text) }
}
