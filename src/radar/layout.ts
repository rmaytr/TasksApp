import { compareUrgency, effectiveHorizon } from '../model/derive'
import { HORIZONS, type Area, type Horizon, type Task } from '../model/types'

/** World units: the radar is laid out in a circle of radius OUTER centered on (0, 0). */
export const OUTER = 470
export const HUB = 58
/** Outer edge of each ring as a fraction of OUTER, nearest ring first. */
const RING_EDGES = [0.31, 0.5, 0.67, 0.83, 1] as const
const SECTOR_PAD = 0.035 // radians kept clear at each wedge edge
const NODE_GAP = 7
const RELAX_ITERATIONS = 80

export const NODE_RADIUS = { s: 7, m: 9.5, l: 12.5 } as const

export interface Ring {
  horizon: Horizon
  inner: number
  outer: number
}

export interface Sector {
  area: Area
  start: number
  end: number
  mid: number
}

export interface PlacedNode {
  task: Task
  horizon: Horizon
  x: number
  y: number
  r: number
}

export const RINGS: readonly Ring[] = HORIZONS.map((horizon, i) => ({
  horizon,
  inner: i === 0 ? HUB : RING_EDGES[i - 1] * OUTER,
  outer: RING_EDGES[i] * OUTER,
}))

/** Wedges start at 12 o'clock and run clockwise, one per visible area. */
export function buildSectors(areas: readonly Area[]): Sector[] {
  const span = (Math.PI * 2) / Math.max(areas.length, 1)
  return areas.map((area, i) => {
    const start = -Math.PI / 2 + i * span
    return { area, start, end: start + span, mid: start + span / 2 }
  })
}

export function polar(angle: number, radius: number): { x: number; y: number } {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

/** Which wedge and ring a world-space point falls into (used while dragging). */
export function hitCell(
  x: number,
  y: number,
  sectors: readonly Sector[],
): { sector: Sector; ring: Ring } | null {
  const radius = Math.hypot(x, y)
  if (radius > OUTER * 1.08 || sectors.length === 0) return null
  const ring = RINGS.find((r) => radius <= r.outer) ?? RINGS[RINGS.length - 1]
  const angle = normalize(Math.atan2(y, x))
  const sector = sectors.find((s) => angle >= normalize(s.start) && angle < normalize(s.start) + (s.end - s.start))
  return { sector: sector ?? sectors[sectors.length - 1], ring }
}

/** Maps any angle into [-π/2, 3π/2) so it compares against sector starts. */
function normalize(a: number): number {
  const twoPi = Math.PI * 2
  let v = a
  while (v < -Math.PI / 2) v += twoPi
  while (v >= (Math.PI * 3) / 2) v -= twoPi
  return v
}

interface Cell {
  sector: Sector
  ring: Ring
}

/** Deterministic placement: spread each wedge×ring cell's tasks on a grid, then relax overlaps. */
export function layoutRadar(tasks: readonly Task[], sectors: readonly Sector[], now: Date): PlacedNode[] {
  const bySector = new Map(sectors.map((s) => [s.area.id, s]))
  const groups = new Map<string, { cell: Cell; tasks: Task[] }>()
  for (const task of tasks) {
    const sector = bySector.get(task.areaId)
    if (!sector) continue
    const horizon = effectiveHorizon(task, now)
    const ring = RINGS[HORIZONS.indexOf(horizon)]
    const key = `${sector.area.id}|${horizon}`
    const group = groups.get(key) ?? { cell: { sector, ring }, tasks: [] }
    groups.set(key, { ...group, tasks: [...group.tasks, task] })
  }
  const placed = [...groups.values()].flatMap(({ cell, tasks: cellTasks }) =>
    placeCell(cell, [...cellTasks].sort((a, b) => compareUrgency(a, b, now))),
  )
  return relax(placed, bySector)
}

function placeCell({ sector, ring }: Cell, tasks: Task[]): PlacedNode[] {
  const a0 = sector.start + SECTOR_PAD
  const a1 = sector.end - SECTOR_PAD
  const band = ring.outer - ring.inner
  const midR = (ring.inner + ring.outer) / 2
  const slot = NODE_RADIUS.l * 2 + NODE_GAP
  const perRow = Math.max(1, Math.floor(((a1 - a0) * midR) / slot))
  const rows = Math.max(1, Math.min(Math.ceil(tasks.length / perRow), Math.floor(band / slot) || 1))
  const perRowActual = Math.ceil(tasks.length / rows)
  return tasks.map((task, i) => {
    const row = Math.floor(i / perRowActual)
    const col = i % perRowActual
    const inRow = Math.min(perRowActual, tasks.length - row * perRowActual)
    // Urgent tasks get the inner row, nearer the hub; rows alternate a half-slot offset.
    const radius = ring.inner + band * ((row + 0.5) / rows)
    const shift = rows > 1 && row % 2 === 1 ? 0.5 : 0
    const t = (col + 0.5 + shift) / (inRow + shift)
    const angle = a0 + (a1 - a0) * Math.min(t, 0.98)
    const { x, y } = polar(angle, radius)
    return { task, horizon: ring.horizon, x, y, r: NODE_RADIUS[task.effort] }
  })
}

function relax(nodes: PlacedNode[], bySector: Map<string, Sector>): PlacedNode[] {
  const pts = nodes.map((n) => ({ ...n }))
  for (let iter = 0; iter < RELAX_ITERATIONS; iter++) {
    let moved = false
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i]
        const b = pts[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 0.01
        const min = a.r + b.r + NODE_GAP
        if (dist >= min) continue
        const push = (min - dist) / 2
        const ux = dx / dist
        const uy = dy / dist
        a.x -= ux * push
        a.y -= uy * push
        b.x += ux * push
        b.y += uy * push
        moved = true
      }
    }
    for (const p of pts) clampToCell(p, bySector.get(p.task.areaId))
    if (!moved) break
  }
  return pts
}

function clampToCell(p: PlacedNode, sector: Sector | undefined): void {
  if (!sector) return
  const ring = RINGS[HORIZONS.indexOf(p.horizon)]
  const radius = Math.min(Math.max(Math.hypot(p.x, p.y), ring.inner + p.r), ring.outer - p.r)
  const angle = normalize(Math.atan2(p.y, p.x))
  const start = normalize(sector.start)
  const lo = start + SECTOR_PAD / 2
  const hi = start + (sector.end - sector.start) - SECTOR_PAD / 2
  const clamped = Math.min(Math.max(angle, lo), hi)
  const pos = polar(clamped, radius)
  p.x = pos.x
  p.y = pos.y
}

/** SVG path for an annular sector, used for the drop-target highlight. */
export function cellPath(sector: Sector, ring: Ring): string {
  if (sector.end - sector.start >= Math.PI * 2 - 1e-6) return donutPath(ring)
  const p0 = polar(sector.start, ring.outer)
  const p1 = polar(sector.end, ring.outer)
  const p2 = polar(sector.end, ring.inner)
  const p3 = polar(sector.start, ring.inner)
  const large = sector.end - sector.start > Math.PI ? 1 : 0
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${ring.outer} ${ring.outer} 0 ${large} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${ring.inner} ${ring.inner} 0 ${large} 0 ${p3.x} ${p3.y}`,
    'Z',
  ].join(' ')
}

/** Full annulus, for the single-area case where a wedge would be degenerate. */
function donutPath(ring: Ring): string {
  const o = ring.outer
  const i = ring.inner
  return [
    `M ${o} 0 A ${o} ${o} 0 1 1 ${-o} 0 A ${o} ${o} 0 1 1 ${o} 0 Z`,
    `M ${i} 0 A ${i} ${i} 0 1 0 ${-i} 0 A ${i} ${i} 0 1 0 ${i} 0 Z`,
  ].join(' ')
}
