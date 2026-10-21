import { z } from 'zod'
import { AREA_COLORS, HORIZONS, REPEATS, type Area, type Task, type Tombstone } from '../model/types'

/** The single document that is encrypted into the vault. */
export interface SyncDoc {
  v: 1
  areas: Area[]
  tasks: Task[]
  tombstones: Tombstone[]
}

export const TOMBSTONE_TTL_MS = 90 * 86_400_000

const stepSchema = z.object({ id: z.string(), title: z.string(), done: z.boolean() })

// Mirrors src/store/schema.ts (not exported there), plus the optional `repeat` field.
const taskSchema = z
  .object({
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
  .transform(({ repeat, ...rest }): Task => (repeat === undefined ? rest : { ...rest, repeat }))

const areaSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    color: z.enum(AREA_COLORS).catch('indigo'),
    updatedAt: z.number().optional().catch(undefined),
  })
  .transform(({ updatedAt, ...rest }): Area => (updatedAt === undefined ? rest : { ...rest, updatedAt }))

const tombstoneSchema = z.object({ id: z.string(), kind: z.enum(['task', 'area']), at: z.number() })

function parseList<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const parsed = schema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

/** Keeps one item per id (the one with the highest `stamp`, first wins on ties), in first-seen order. */
function dedupeById<T extends { id: string }>(items: T[], stamp: (item: T) => number): T[] {
  const best = new Map<string, T>()
  for (const item of items) {
    const current = best.get(item.id)
    if (current === undefined || stamp(item) > stamp(current)) best.set(item.id, item)
  }
  return [...best.values()]
}

/** One tombstone per kind+id, keeping the newest `at`. */
export function dedupeTombstones(tombstones: Tombstone[]): Tombstone[] {
  const best = new Map<string, Tombstone>()
  for (const t of tombstones) {
    const key = `${t.kind}:${t.id}`
    const current = best.get(key)
    if (current === undefined || t.at > current.at) best.set(key, t)
  }
  return [...best.values()]
}

const EMPTY_DOC: SyncDoc = { v: 1, areas: [], tasks: [], tombstones: [] }

/**
 * Validates a decrypted document. Bad items are dropped individually so one corrupt record
 * never wipes the rest; an unknown or invalid top level yields an empty document.
 */
export function parseSyncDoc(raw: unknown): SyncDoc {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...EMPTY_DOC }
  const obj = raw as Record<string, unknown>
  if (obj.v !== 1) return { ...EMPTY_DOC }
  return {
    v: 1,
    areas: dedupeById(parseList(obj.areas, areaSchema), (a) => a.updatedAt ?? 0),
    tasks: dedupeById(parseList(obj.tasks, taskSchema), (t) => t.updatedAt),
    tombstones: dedupeTombstones(parseList(obj.tombstones, tombstoneSchema)),
  }
}

/** Drops tombstones older than the TTL (a tombstone exactly `TTL` old is kept). */
export function pruneTombstones(tombstones: Tombstone[], now: number): Tombstone[] {
  return tombstones.filter((t) => now - t.at <= TOMBSTONE_TTL_MS)
}
