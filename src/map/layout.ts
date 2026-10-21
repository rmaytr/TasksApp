import type { Area, Step, Task } from '../model/types'

export type MapMode = 'mindmap' | 'outline'

export type MapNodeKind = 'root' | 'area' | 'task' | 'step' | 'add-task' | 'add-area'

export interface MapNode {
  key: string
  kind: MapNodeKind
  /** Left edge and vertical center, in layout pixels. */
  x: number
  y: number
  w: number
  h: number
  side: 1 | -1
  area?: Area
  task?: Task
  step?: Step
}

export interface MapLink {
  key: string
  from: { x: number; y: number }
  to: { x: number; y: number }
  area?: Area
  mode: MapMode
}

export interface MapInput {
  areas: readonly Area[]
  /** Open tasks per area id, already sorted by urgency. */
  tasksByArea: ReadonlyMap<string, readonly Task[]>
  collapsedAreas: ReadonlySet<string>
  expandedTasks: ReadonlySet<string>
  canAddArea: boolean
}

export interface MapLayout {
  nodes: MapNode[]
  links: MapLink[]
  bounds: { x0: number; y0: number; x1: number; y1: number }
}

/* Mind-map geometry: columns grow outward from the root on both sides. */
const ROOT = { w: 150, h: 52 }
const AREA = { w: 176, h: 44 }
const TASK = { w: 272, h: 38 }
const STEP = { w: 230, h: 28 }
const COL = { area: 110, task: 336, step: 660 }
const GAP = { task: 8, step: 4, area: 22 }

/* Outline geometry (phones): one column, children indented. */
const INDENT = { area: 14, task: 34, step: 58 }
const ROW = { root: 52, area: 48, task: 46, step: 34 }

interface Block {
  height: number
  place: (top: number) => { nodes: MapNode[]; links: MapLink[]; anchor: number }
}

function stepBlock(task: Task, side: 1 | -1, expanded: boolean): Block['place'] | null {
  if (!expanded || task.steps.length === 0) return null
  return (top) => {
    const nodes = task.steps.map((step, i) => ({
      key: `step:${step.id}`,
      kind: 'step' as const,
      x: side === 1 ? COL.step : -COL.step - STEP.w,
      y: top + i * (STEP.h + GAP.step) + STEP.h / 2,
      w: STEP.w,
      h: STEP.h,
      side,
      task,
      step,
    }))
    return { nodes, links: [], anchor: top }
  }
}

function taskBlock(task: Task | null, area: Area, side: 1 | -1, expanded: boolean): Block {
  const stepsHeight = task && expanded ? task.steps.length * (STEP.h + GAP.step) - GAP.step : 0
  const height = Math.max(TASK.h, stepsHeight)
  return {
    height,
    place: (top) => {
      const y = top + height / 2
      const node: MapNode = {
        key: task ? `task:${task.id}` : `add-task:${area.id}`,
        kind: task ? 'task' : 'add-task',
        x: side === 1 ? COL.task : -COL.task - TASK.w,
        y,
        w: TASK.w,
        h: TASK.h,
        side,
        area,
        ...(task && { task }),
      }
      const steps = task ? stepBlock(task, side, expanded) : null
      const placed = steps?.(top + (height - stepsHeight) / 2)
      const edge = side === 1 ? node.x + node.w : node.x
      const links = (placed?.nodes ?? []).map((s) => ({
        key: `l:${s.key}`,
        from: { x: edge, y },
        to: { x: side === 1 ? s.x : s.x + s.w, y: s.y },
        area,
        mode: 'mindmap' as const,
      }))
      return { nodes: [node, ...(placed?.nodes ?? [])], links, anchor: y }
    },
  }
}

function areaBlock(area: Area, input: MapInput, side: 1 | -1): Block {
  const collapsed = input.collapsedAreas.has(area.id)
  const tasks = collapsed ? [] : [...(input.tasksByArea.get(area.id) ?? []), null]
  const children = tasks.map((t) => taskBlock(t, area, side, t ? input.expandedTasks.has(t.id) : false))
  const childHeight = children.reduce((sum, c) => sum + c.height, 0) + Math.max(0, children.length - 1) * GAP.task
  const height = Math.max(AREA.h, childHeight)
  return {
    height,
    place: (top) => {
      const y = top + height / 2
      const node: MapNode = {
        key: `area:${area.id}`,
        kind: 'area',
        x: side === 1 ? COL.area : -COL.area - AREA.w,
        y,
        w: AREA.w,
        h: AREA.h,
        side,
        area,
      }
      const nodes: MapNode[] = [node]
      const links: MapLink[] = []
      let cursor = top + (height - childHeight) / 2
      for (const child of children) {
        const placed = child.place(cursor)
        const head = placed.nodes[0]
        nodes.push(...placed.nodes)
        links.push(...placed.links, {
          key: `l:${head.key}`,
          from: { x: side === 1 ? node.x + node.w : node.x, y },
          to: { x: side === 1 ? head.x : head.x + head.w, y: placed.anchor },
          area,
          mode: 'mindmap',
        })
        cursor += child.height + GAP.task
      }
      return { nodes, links, anchor: y }
    },
  }
}

function addAreaBlock(side: 1 | -1): Block {
  return {
    height: AREA.h,
    place: (top) => ({
      nodes: [
        {
          key: 'add-area',
          kind: 'add-area',
          x: side === 1 ? COL.area : -COL.area - AREA.w,
          y: top + AREA.h / 2,
          w: AREA.w,
          h: AREA.h,
          side,
        },
      ],
      links: [],
      anchor: top + AREA.h / 2,
    }),
  }
}

function placeSide(blocks: Block[]): { nodes: MapNode[]; links: MapLink[] } {
  const total = blocks.reduce((s, b) => s + b.height, 0) + Math.max(0, blocks.length - 1) * GAP.area
  let cursor = -total / 2
  const nodes: MapNode[] = []
  const links: MapLink[] = []
  for (const block of blocks) {
    const placed = block.place(cursor)
    const head = placed.nodes[0]
    nodes.push(...placed.nodes)
    links.push(...placed.links, {
      key: `l:${head.key}`,
      from: { x: head.side * (ROOT.w / 2), y: 0 },
      to: { x: head.side === 1 ? head.x : head.x + head.w, y: placed.anchor },
      area: head.area,
      mode: 'mindmap',
    })
    cursor += block.height + GAP.area
  }
  return { nodes, links }
}

/** Splits areas between the two sides so their heights stay roughly balanced. */
function balance(areas: readonly Area[], input: MapInput): { right: Area[]; left: Area[] } {
  const right: Area[] = []
  const left: Area[] = []
  let rh = 0
  let lh = 0
  for (const area of areas) {
    const h = areaBlock(area, input, 1).height
    if (rh <= lh) {
      right.push(area)
      rh += h
    } else {
      left.push(area)
      lh += h
    }
  }
  return { right, left }
}

function mindmap(input: MapInput): Omit<MapLayout, 'bounds'> {
  const { right, left } = balance(input.areas, input)
  const rightBlocks = right.map((a) => areaBlock(a, input, 1))
  const leftBlocks = left.map((a) => areaBlock(a, input, -1))
  if (input.canAddArea) (left.length < right.length ? leftBlocks : rightBlocks).push(addAreaBlock(left.length < right.length ? -1 : 1))
  const r = placeSide(rightBlocks)
  const l = placeSide(leftBlocks)
  const root: MapNode = { key: 'root', kind: 'root', x: -ROOT.w / 2, y: 0, w: ROOT.w, h: ROOT.h, side: 1 }
  return { nodes: [root, ...r.nodes, ...l.nodes], links: [...r.links, ...l.links] }
}

/** Phone layout: an indented outline that scrolls vertically; `width` is the available px. */
function outline(input: MapInput, width: number): Omit<MapLayout, 'bounds'> {
  const nodes: MapNode[] = []
  const links: MapLink[] = []
  let y = ROW.root / 2
  nodes.push({ key: 'root', kind: 'root', x: 0, y, w: Math.min(ROOT.w, width), h: ROOT.h - 8, side: 1 })
  y += ROW.root / 2
  const push = (node: Omit<MapNode, 'y' | 'side'>, row: number, parentX: number, area?: Area): void => {
    const cy = y + row / 2
    nodes.push({ ...node, y: cy, side: 1 })
    links.push({ key: `l:${node.key}`, from: { x: parentX, y: cy }, to: { x: node.x, y: cy }, area, mode: 'outline' })
    y += row
  }
  for (const area of input.areas) {
    push({ key: `area:${area.id}`, kind: 'area', x: INDENT.area, w: width - INDENT.area, h: AREA.h - 6, area }, ROW.area, 6, area)
    if (input.collapsedAreas.has(area.id)) continue
    for (const task of input.tasksByArea.get(area.id) ?? []) {
      push({ key: `task:${task.id}`, kind: 'task', x: INDENT.task, w: width - INDENT.task, h: TASK.h, area, task }, ROW.task, INDENT.area + 8, area)
      if (!input.expandedTasks.has(task.id)) continue
      for (const step of task.steps) {
        push({ key: `step:${step.id}`, kind: 'step', x: INDENT.step, w: width - INDENT.step, h: STEP.h, area, task, step }, ROW.step, INDENT.task + 8, area)
      }
    }
    push({ key: `add-task:${area.id}`, kind: 'add-task', x: INDENT.task, w: width - INDENT.task, h: TASK.h, area }, ROW.task, INDENT.area + 8, area)
  }
  if (input.canAddArea) push({ key: 'add-area', kind: 'add-area', x: INDENT.area, w: width - INDENT.area, h: AREA.h - 6 }, ROW.area, 6)
  return { nodes, links }
}

export function layoutMap(input: MapInput, mode: MapMode, width = 360): MapLayout {
  const { nodes, links } = mode === 'mindmap' ? mindmap(input) : outline(input, width)
  const bounds = nodes.reduce(
    (b, n) => ({
      x0: Math.min(b.x0, n.x),
      y0: Math.min(b.y0, n.y - n.h / 2),
      x1: Math.max(b.x1, n.x + n.w),
      y1: Math.max(b.y1, n.y + n.h / 2),
    }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
  )
  return { nodes, links, bounds }
}
