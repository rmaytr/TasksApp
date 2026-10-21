export const LABEL_FONT_PX = 12.5
const CHAR_PX = 6.7
const LABEL_HEIGHT = 16
const MAX_CHARS = 26
const PAD = 5

export interface ScreenNode {
  id: string
  x: number
  y: number
  r: number
  title: string
  /** Lower draws its label first (gets the best spot). */
  rank: number
  /** -1 left half, 1 right half: labels prefer the outward side. */
  side: -1 | 1
}

export interface PlacedLabel {
  id: string
  x: number
  y: number
  anchor: 'start' | 'end' | 'middle'
  text: string
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function truncate(title: string, max = MAX_CHARS): string {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title
}

const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

function candidates(n: ScreenNode, width: number): { box: Box; label: PlacedLabel }[] {
  const text = truncate(n.title)
  const h = LABEL_HEIGHT / 2
  const right = {
    box: { x0: n.x + n.r + PAD, y0: n.y - h, x1: n.x + n.r + PAD + width, y1: n.y + h },
    label: { id: n.id, x: n.x + n.r + PAD, y: n.y, anchor: 'start' as const, text },
  }
  const left = {
    box: { x0: n.x - n.r - PAD - width, y0: n.y - h, x1: n.x - n.r - PAD, y1: n.y + h },
    label: { id: n.id, x: n.x - n.r - PAD, y: n.y, anchor: 'end' as const, text },
  }
  const below = {
    box: { x0: n.x - width / 2, y0: n.y + n.r + 2, x1: n.x + width / 2, y1: n.y + n.r + 2 + LABEL_HEIGHT },
    label: { id: n.id, x: n.x, y: n.y + n.r + 2 + h, anchor: 'middle' as const, text },
  }
  const above = {
    box: { x0: n.x - width / 2, y0: n.y - n.r - 2 - LABEL_HEIGHT, x1: n.x + width / 2, y1: n.y - n.r - 2 },
    label: { id: n.id, x: n.x, y: n.y - n.r - 2 - h, anchor: 'middle' as const, text },
  }
  return n.side === 1 ? [right, below, above, left] : [left, below, above, right]
}

/**
 * Greedy label placement in screen space: the most urgent nodes pick first, each tries
 * the outward side, then below/above, then inward; a label that fits nowhere is hidden
 * (it still shows on hover, focus and selection).
 */
export function placeLabels(
  nodes: readonly ScreenNode[],
  bounds: { w: number; h: number },
  obstacles: readonly Box[] = [],
): PlacedLabel[] {
  const occupied: Box[] = [
    ...obstacles,
    ...nodes.map((n) => ({ x0: n.x - n.r, y0: n.y - n.r, x1: n.x + n.r, y1: n.y + n.r })),
  ]
  const placed: PlacedLabel[] = []
  const sorted = [...nodes].sort((a, b) => a.rank - b.rank)
  for (const node of sorted) {
    const width = truncate(node.title).length * CHAR_PX
    const fit = candidates(node, width).find(
      ({ box }) =>
        box.x0 >= 2 &&
        box.y0 >= 2 &&
        box.x1 <= bounds.w - 2 &&
        box.y1 <= bounds.h - 2 &&
        !occupied.some((o) => overlaps(o, box)),
    )
    if (!fit) continue
    occupied.push(fit.box)
    placed.push(fit.label)
  }
  return placed
}
