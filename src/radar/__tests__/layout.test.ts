import { describe, expect, it } from 'vitest'
import { DEFAULT_AREAS } from '../../model/defaults'
import { HORIZONS, type Horizon, type Task } from '../../model/types'
import { buildSectors, hitCell, layoutRadar, NODE_RADIUS, OUTER, RINGS } from '../layout'
import { placeLabels, truncate } from '../labels'

const NOW = new Date(2026, 9, 21, 12)

let seq = 0
function task(areaId: string, horizon: Horizon, extra: Partial<Task> = {}): Task {
  seq += 1
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    notes: '',
    areaId,
    horizon,
    due: null,
    high: false,
    effort: 'm',
    waiting: null,
    plan: null,
    steps: [],
    done: false,
    doneAt: null,
    createdAt: seq,
    updatedAt: NOW.getTime(),
    spentMinutes: 0,
    ...extra,
  }
}

const areas = DEFAULT_AREAS.map((a) => ({ ...a }))
const sectors = buildSectors(areas)

function cellOf(x: number, y: number) {
  return hitCell(x, y, sectors)
}

describe('buildSectors', () => {
  it('splits the circle evenly starting at 12 o’clock', () => {
    expect(sectors).toHaveLength(6)
    expect(sectors[0].start).toBeCloseTo(-Math.PI / 2)
    expect(sectors[5].end).toBeCloseTo(Math.PI * 1.5)
  })
})

describe('layoutRadar', () => {
  it('places every task inside its own wedge and ring', () => {
    const tasks = areas.flatMap((a) => HORIZONS.flatMap((h) => [task(a.id, h), task(a.id, h)]))
    const nodes = layoutRadar(tasks, sectors, NOW)
    expect(nodes).toHaveLength(tasks.length)
    for (const n of nodes) {
      const cell = cellOf(n.x, n.y)
      expect(cell?.sector.area.id).toBe(n.task.areaId)
      expect(cell?.ring.horizon).toBe(n.horizon)
    }
  })

  it('keeps 40 tasks in one crowded cell from overlapping', () => {
    const tasks = Array.from({ length: 40 }, () => task('career', 'month', { effort: 's' }))
    const nodes = layoutRadar(tasks, sectors, NOW)
    let overlaps = 0
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y)
        if (d < nodes[i].r + nodes[j].r) overlaps += 1
      }
    }
    expect(overlaps).toBe(0)
  })

  it('pulls a task inward when its due date is near', () => {
    const due = task('classes', 'someday', { due: '2026-10-22' })
    const [node] = layoutRadar([due], sectors, NOW)
    expect(node.horizon).toBe('week')
  })

  it('skips tasks whose area is hidden (not in sectors)', () => {
    const visible = buildSectors(areas.slice(0, 2))
    const nodes = layoutRadar([task('life', 'today'), task('classes', 'today')], visible, NOW)
    expect(nodes.map((n) => n.task.areaId)).toEqual(['classes'])
  })

  it('is deterministic', () => {
    const tasks = [task('orgs', 'week'), task('orgs', 'week'), task('orgs', 'week')]
    const a = layoutRadar(tasks, sectors, NOW)
    const b = layoutRadar(tasks, sectors, NOW)
    expect(a.map((n) => [n.x, n.y])).toEqual(b.map((n) => [n.x, n.y]))
  })

  it('sizes nodes by effort', () => {
    const nodes = layoutRadar([task('life', 'later', { effort: 's' }), task('life', 'later', { effort: 'l' })], sectors, NOW)
    expect(nodes.map((n) => n.r).sort()).toEqual([NODE_RADIUS.l, NODE_RADIUS.s].sort())
  })
})

describe('hitCell', () => {
  it('maps the center to the Today ring and far points to null', () => {
    expect(cellOf(0, -RINGS[0].inner - 1)?.ring.horizon).toBe('today')
    expect(cellOf(OUTER * 2, 0)).toBeNull()
  })

  it('handles angles across the 12 o’clock seam', () => {
    // Just left of 12 o’clock belongs to the last wedge, just right to the first.
    expect(cellOf(-5, -300)?.sector.area.id).toBe('life')
    expect(cellOf(5, -300)?.sector.area.id).toBe('classes')
  })
})

describe('placeLabels', () => {
  const base = { r: 5, rank: 0, side: 1 as const }

  it('places non-overlapping labels and skips ones with no room', () => {
    const nodes = [
      { ...base, id: 'a', x: 100, y: 100, title: 'First task' },
      { ...base, id: 'b', x: 100, y: 104, title: 'Second task right below', rank: 1 },
    ]
    const labels = placeLabels(nodes, { w: 400, h: 400 })
    expect(labels.map((l) => l.id)).toContain('a')
    expect(new Set(labels.map((l) => `${l.x},${l.y}`)).size).toBe(labels.length)
  })

  it('respects obstacles and viewport bounds', () => {
    const nodes = [{ ...base, id: 'a', x: 395, y: 100, title: 'Near the right edge' }]
    const labels = placeLabels(nodes, { w: 400, h: 400 }, [{ x0: 0, y0: 0, x1: 400, y1: 80 }])
    expect(labels[0]?.anchor).toBe('end')
  })

  it('truncates long titles with an ellipsis', () => {
    expect(truncate('a'.repeat(40))).toHaveLength(30)
    expect(truncate('short')).toBe('short')
  })
})
