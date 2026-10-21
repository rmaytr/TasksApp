import { z } from 'zod'
import { DEFAULT_AREAS } from '../model/defaults'
import { AREA_COLORS, HORIZONS, REPEATS, type Area, type Task, type Tombstone } from '../model/types'

const stepSchema = z.object({ id: z.string(), title: z.string(), done: z.boolean() })

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().catch(''),
  areaId: z.string(),
  horizon: z.enum(HORIZONS).catch('later'),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  high: z.boolean().catch(false),
  effort: z.enum(['s', 'm', 'l']).catch('m'),
  waiting: z.string().nullable().catch(null),
  plan: z.string().nullable().catch(null),
  steps: z.array(stepSchema).catch([]),
  done: z.boolean().catch(false),
  doneAt: z.number().nullable().catch(null),
  createdAt: z.number(),
  updatedAt: z.number(),
  spentMinutes: z.number().nonnegative().catch(0),
  repeat: z.enum(REPEATS).optional().catch(undefined),
})

export const areaSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.enum(AREA_COLORS).catch('indigo'),
  updatedAt: z.number().optional().catch(undefined),
})

export const tombstoneSchema = z.object({ id: z.string(), kind: z.enum(['task', 'area']), at: z.number() })

export const prefsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).catch('system'),
  onboarded: z.boolean().catch(false),
  hiddenAreas: z.array(z.string()).catch([]),
  lastResetAt: z.number().nullable().catch(null),
  /** Single-key shortcuts can be switched off (WCAG 2.1.4). */
  shortcuts: z.boolean().catch(true),
  /** One-time hints the user has dismissed. */
  seenTips: z.array(z.string()).catch([]),
})

export type Prefs = z.infer<typeof prefsSchema>

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  onboarded: false,
  hiddenAreas: [],
  lastResetAt: null,
  shortcuts: true,
  seenTips: [],
}

export interface PersistedState {
  areas: Area[]
  tasks: Task[]
  /** Deletions remembered for sync merges. */
  tombstones: Tombstone[]
  prefs: Prefs
}

/**
 * Validates whatever came out of IndexedDB. Bad tasks are dropped individually so a
 * single corrupt record never wipes the rest; tasks pointing at a missing area are
 * re-homed to the first area.
 */
export function sanitizePersisted(raw: unknown): PersistedState {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const areas = parseList(obj.areas, areaSchema)
  const safeAreas = areas.length > 0 ? areas : DEFAULT_AREAS.map((a) => ({ ...a }))
  const areaIds = new Set(safeAreas.map((a) => a.id))
  const tasks = parseList(obj.tasks, taskSchema).map((t) =>
    areaIds.has(t.areaId) ? t : { ...t, areaId: safeAreas[0].id },
  )
  const prefs = prefsSchema.safeParse(obj.prefs)
  const tombstones = parseList(obj.tombstones, tombstoneSchema)
  return { areas: safeAreas, tasks, tombstones, prefs: prefs.success ? prefs.data : DEFAULT_PREFS }
}

function parseList<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const parsed = schema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}
