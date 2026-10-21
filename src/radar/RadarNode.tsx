import { memo, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { areaColor } from '../hooks'
import { stepProgress } from '../model/derive'
import { HORIZON_LABEL, type Area } from '../model/types'
import type { PlacedNode } from './layout'

interface RadarNodeProps {
  node: PlacedNode
  area: Area | undefined
  stale: boolean
  selected: boolean
  dragging: boolean
  dragPos: { x: number; y: number } | null
  introDelay: number
  /** Roving tabindex: only one node is in the tab order; arrows move between nodes. */
  tabbable: boolean
  hitR: number
  dueLabel: string | null
  onArrow: (key: string) => void
  onFocusNode: () => void
  onPointerDown: (e: ReactPointerEvent<SVGGElement>) => void
  onPointerMove: (e: ReactPointerEvent<SVGGElement>) => void
  onPointerUp: (e: ReactPointerEvent<SVGGElement>) => void
  onPointerCancel: () => void
  onHover: (id: string | null) => void
  onOpen: () => void
  onNudge: (delta: -1 | 1) => void
}

function describe(node: PlacedNode, area: Area | undefined, stale: boolean, dueLabel: string | null): string {
  const { task } = node
  const parts = [task.title, area?.name, HORIZON_LABEL[node.horizon]]
  if (dueLabel) parts.push(`due ${dueLabel}`)
  if (task.high) parts.push('high priority')
  if (stale) parts.push('untouched for 2 weeks')
  if (task.waiting) parts.push(`waiting on ${task.waiting}`)
  if (task.steps.length) parts.push(`${task.steps.filter((s) => s.done).length} of ${task.steps.length} steps done`)
  return parts.filter(Boolean).join(', ')
}

/** Arc around the dot showing how many steps are checked off. */
function progressArc(r: number, fraction: number): string | null {
  if (fraction <= 0 || fraction >= 1) return null
  const end = -Math.PI / 2 + fraction * Math.PI * 2
  const x = Math.cos(end) * r
  const y = Math.sin(end) * r
  return `M 0 ${-r} A ${r} ${r} 0 ${fraction > 0.5 ? 1 : 0} 1 ${x} ${y}`
}

export const RadarNode = memo(function RadarNode(props: RadarNodeProps) {
  const { node, area, stale, selected, dragging, dragPos, introDelay } = props
  const { task, r } = node
  const x = dragPos?.x ?? node.x
  const y = dragPos?.y ?? node.y
  const progress = stepProgress(task)
  const arc = progressArc(r + 4, progress)
  const color = areaColor(area)

  const onKeyDown = (e: KeyboardEvent<SVGGElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      props.onOpen()
    } else if (e.key === '[') props.onNudge(-1)
    else if (e.key === ']') props.onNudge(1)
    else if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault()
      props.onArrow(e.key)
    }
  }

  const className = [
    'node',
    stale && 'node--stale',
    selected && 'node--selected',
    dragging && 'node--dragging',
    task.waiting && 'node--waiting',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <g
      className={className}
      transform={`translate(${x} ${y})`}
      style={{ '--c': color, '--delay': `${introDelay}ms` } as CSSProperties}
      role="button"
      tabIndex={props.tabbable ? 0 : -1}
      aria-label={describe(node, area, stale, props.dueLabel)}
      aria-current={selected ? 'true' : undefined}
      aria-keyshortcuts="[ ]"
      aria-describedby="radar-key-hint"
      data-task-id={task.id}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      onPointerEnter={() => props.onHover(task.id)}
      onPointerLeave={() => props.onHover(null)}
      onFocus={() => {
        props.onHover(task.id)
        props.onFocusNode()
      }}
      onBlur={() => props.onHover(null)}
      onKeyDown={onKeyDown}
    >
      <g className="node__body">
        <circle r={props.hitR} className="node__hit" />
        {task.high && <circle r={r + 4.5} className="node__halo" vectorEffect="non-scaling-stroke" />}
        {arc && <path d={arc} className="node__progress" vectorEffect="non-scaling-stroke" />}
        <circle r={r} className="node__dot" vectorEffect="non-scaling-stroke" />
        {selected && <circle r={r + 8} className="node__ring" vectorEffect="non-scaling-stroke" />}
      </g>
    </g>
  )
})
