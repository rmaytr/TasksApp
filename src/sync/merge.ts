import type { Area, Task, Tombstone } from '../model/types'
import { dedupeTombstones, pruneTombstones, type SyncDoc } from './doc'

type Kind = Tombstone['kind']

const tombstoneKey = (kind: Kind, id: string): string => `${kind}:${id}`

const areaStamp = (area: Area): number => area.updatedAt ?? 0
const taskStamp = (task: Task): number => task.updatedAt

/**
 * Per-id last-writer-wins. Order: local items in local order, then remote-only items in
 * remote order. On an exact `stamp` tie the REMOTE copy wins, so two devices that both
 * merge the same pair of copies pick the same winner whichever side they are on.
 */
function mergeById<T extends { id: string }>(local: T[], remote: T[], stamp: (item: T) => number): T[] {
  const remoteById = new Map(remote.map((item) => [item.id, item]))
  const localIds = new Set(local.map((item) => item.id))
  const fromLocal = local.map((item) => {
    const other = remoteById.get(item.id)
    return other !== undefined && stamp(other) >= stamp(item) ? other : item
  })
  return [...fromLocal, ...remote.filter((item) => !localIds.has(item.id))]
}

interface Filtered<T> {
  kept: T[]
  /** Keys of tombstones that lost against a newer edit of their item. */
  outdated: Set<string>
}

/** Removes items covered by a tombstone (`at >= stamp`); notes tombstones the items outlived. */
function applyTombstones<T extends { id: string }>(
  items: T[],
  kind: Kind,
  tombstones: Map<string, Tombstone>,
  stamp: (item: T) => number,
): Filtered<T> {
  const outdated = new Set<string>()
  const kept = items.filter((item) => {
    const key = tombstoneKey(kind, item.id)
    const tomb = tombstones.get(key)
    if (tomb === undefined) return true
    if (tomb.at >= stamp(item)) return false
    outdated.add(key)
    return true
  })
  return { kept, outdated }
}

/**
 * Areas that survive tombstones. If that would leave none although areas exist, the merged
 * areas are restored (with a fresh `updatedAt` so they beat the old tombstones everywhere).
 */
function resolveAreas(
  merged: Area[],
  tombstones: Map<string, Tombstone>,
  now: number,
): { areas: Area[]; outdated: Set<string> } {
  const { kept, outdated } = applyTombstones(merged, 'area', tombstones, areaStamp)
  if (kept.length > 0 || merged.length === 0) return { areas: kept, outdated }
  const areas = merged.map((area) => ({ ...area, updatedAt: now }))
  return { areas, outdated: new Set(areas.map((area) => tombstoneKey('area', area.id))) }
}

function rehomeOrphans(tasks: Task[], areas: Area[]): Task[] {
  if (areas.length === 0) return tasks
  const ids = new Set(areas.map((area) => area.id))
  const fallback = areas[0].id
  return tasks.map((task) => (ids.has(task.areaId) ? task : { ...task, areaId: fallback }))
}

/**
 * Merges two copies of the document. Deterministic and idempotent; commutative in content
 * (item order follows `local` first). Re-homed tasks keep their `updatedAt`, because every
 * device re-homes identically and a bump would clobber real edits made elsewhere.
 */
export function mergeDocs(local: SyncDoc, remote: SyncDoc, now: number): SyncDoc {
  const tombstones = dedupeTombstones([...local.tombstones, ...remote.tombstones])
  const tombstoneIndex = new Map(tombstones.map((t) => [tombstoneKey(t.kind, t.id), t]))

  const mergedAreas = mergeById(local.areas, remote.areas, areaStamp)
  const mergedTasks = mergeById(local.tasks, remote.tasks, taskStamp)

  const { areas, outdated: outdatedAreas } = resolveAreas(mergedAreas, tombstoneIndex, now)
  const { kept: tasks, outdated: outdatedTasks } = applyTombstones(mergedTasks, 'task', tombstoneIndex, taskStamp)

  const live = tombstones.filter((t) => {
    const key = tombstoneKey(t.kind, t.id)
    return !outdatedAreas.has(key) && !outdatedTasks.has(key)
  })

  return { v: 1, areas, tasks: rehomeOrphans(tasks, areas), tombstones: pruneTombstones(live, now) }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function canonicalList<T>(items: T[], sortKey: (item: T) => string): string {
  const keyed = items.map((item) => ({ key: sortKey(item), text: canonical(item) }))
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return keyed.map((entry) => entry.text).join(',')
}

/**
 * Structural equality that ignores the order of areas, tasks and tombstones (and object key
 * order). Order is ignored on purpose: merge keeps local order, so an order-sensitive
 * comparison would make two devices with different orders push to each other forever.
 */
export function docsEqual(a: SyncDoc, b: SyncDoc): boolean {
  const summarize = (doc: SyncDoc): string =>
    [
      doc.v,
      canonicalList(doc.areas, (x) => x.id),
      canonicalList(doc.tasks, (x) => x.id),
      canonicalList(doc.tombstones, (x) => tombstoneKey(x.kind, x.id)),
    ].join('|')
  return summarize(a) === summarize(b)
}
