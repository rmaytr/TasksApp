import type { Box } from './labels'
import { OUTER, type Sector } from './layout'

/** Screen pixels kept free beside / above the outer ring for area names. */
const SIDE_PX = 58
const TOP_PX = 30
/** Area names sit this far outside the outer ring (world units). */
const AREA_LABEL_OFFSET = 26
/** Ring names run along the top spoke, from the axis to about this many px right of it. */
export const RING_LABEL_SPAN_PX = 66

/** Pixels per world unit at zoom 1, fitting the radar plus its area names into the viewport. */
export function baseScale(w: number, h: number): number {
  const aw = Math.max(w - 2 * SIDE_PX, 120)
  const ah = Math.max(h - 2 * TOP_PX, 120)
  return Math.min(aw, ah) / (2 * OUTER)
}

export interface AreaLabel {
  x: number
  y: number
  box: Box
}

/**
 * Where an area's name goes: outside its wedge, pushed clear of the ring names on the
 * top spoke and kept inside the viewport so narrow phones never clip it.
 */
export function areaLabelPosition(
  sector: Sector,
  count: number,
  center: { x: number; y: number },
  scale: number,
  bounds: { w: number; h: number },
): AreaLabel {
  const half = (sector.area.name.length * 8.4 + String(count).length * 7 + 8) / 2
  const radius = (OUTER + AREA_LABEL_OFFSET) * scale
  let x = center.x + Math.cos(sector.mid) * radius
  const y = center.y + Math.sin(sector.mid) * radius
  const nearTopSpoke = y < center.y && x > center.x && x - half < center.x + RING_LABEL_SPAN_PX
  if (nearTopSpoke) x = center.x + RING_LABEL_SPAN_PX + half
  x = Math.min(Math.max(x, half + 4), bounds.w - half - 4)
  return { x, y, box: { x0: x - half, y0: y - 10, x1: x + half, y1: y + 10 } }
}
