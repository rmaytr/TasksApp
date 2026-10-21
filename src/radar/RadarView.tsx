import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { daysBetween, formatDue, todayISO } from '../lib/dates'
import { areaColor, areaTextColor, useMediaQuery, useNow, useReducedMotion } from '../hooks'
import { doneThisWeek, effectiveHorizon, horizonIndex, isStale } from '../model/derive'
import { MAX_AREAS } from '../model/defaults'
import { HORIZONS, HORIZON_LABEL, type Horizon, type Task } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from '../components/Icon'
import { NearList } from '../components/NearList'
import { CoachTip } from '../components/CoachTip'
import { RadarHub, RadarRings } from './RadarDecor'
import { RadarNode } from './RadarNode'
import { buildSectors, cellPath, hitCell, HUB, layoutRadar, OUTER, RINGS, type PlacedNode } from './layout'
import { LABEL_FONT_PX, placeLabels, truncate, type Box, type ScreenNode } from './labels'
import { areaLabelPosition, baseScale } from './frame'
import { usePanZoom } from './usePanZoom'
import './Radar.css'

const DRAG_THRESHOLD = 5
let introPlayed = false

interface DragState {
  id: string
  pointerId: number
  startX: number
  startY: number
  wx: number
  wy: number
  active: boolean
}

export function RadarView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [playIntro] = useState(() => !introPlayed)
  const reduceMotion = useReducedMotion()
  const phone = useMediaQuery('(max-width: 760px)')
  const now = useNow()

  const areas = useStore((s) => s.areas)
  const tasks = useStore((s) => s.tasks)
  const hidden = useStore((s) => s.prefs.hiddenAreas)
  const selectedId = useStore((s) => s.selectedId)
  const lastCompleted = useStore((s) => s.lastCompleted)
  const select = useStore((s) => s.select)
  const moveTask = useStore((s) => s.moveTask)
  const setView = useStore((s) => s.setView)
  const setImportOpen = useStore((s) => s.setImportOpen)
  const onboarded = useStore((s) => s.prefs.onboarded)
  const setNewAreaOpen = useStore((s) => s.setNewAreaOpen)

  useEffect(() => {
    introPlayed = true
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The ripple plays for completions that happen while the radar is open (or just before it opened);
  // its CSS animation ends fully transparent, so the element can stay mounted.
  const [mountedAt] = useState(() => Date.now())
  const ripple = lastCompleted && lastCompleted.at > mountedAt - 2000 ? lastCompleted : null

  const { transform, setTransform, reset, zoomBy, handlers } = usePanZoom(containerRef, size)
  const scale = baseScale(size.w, size.h) * transform.k
  const cx = size.w / 2 + transform.x
  const cy = size.h / 2 + transform.y
  const toScreen = (x: number, y: number): { x: number; y: number } => ({ x: cx + x * scale, y: cy + y * scale })
  const toWorld = (sx: number, sy: number): { x: number; y: number } => ({ x: (sx - cx) / scale, y: (sy - cy) / scale })

  const visibleAreas = useMemo(() => areas.filter((a) => !hidden.includes(a.id)), [areas, hidden])
  const sectors = useMemo(() => buildSectors(visibleAreas), [visibleAreas])
  const open = useMemo(() => tasks.filter((t) => !t.done), [tasks])
  const nodes = useMemo(() => layoutRadar(open, sectors, now), [open, sectors, now])
  const todayCount = useMemo(() => open.filter((t) => effectiveHorizon(t, now) === 'today').length, [open, now])
  const weekCount = useMemo(() => open.filter((t) => effectiveHorizon(t, now) === 'week').length, [open, now])
  const doneWeek = useMemo(() => doneThisWeek(tasks, now), [tasks, now])
  const areaLabels = useMemo(
    () =>
      sectors.map((s) => {
        const count = open.filter((t) => t.areaId === s.area.id).length
        return { sector: s, count, ...areaLabelPosition(s, count, { x: cx, y: cy }, scale, size) }
      }),
    [sectors, open, cx, cy, scale, size],
  )

  const labels = useMemo(() => {
    if (size.w === 0) return []
    const screenNodes: ScreenNode[] = nodes
      .filter((n) => n.task.id !== drag?.id)
      .map((n) => ({
        id: n.task.id,
        x: cx + n.x * scale,
        y: cy + n.y * scale,
        r: n.r * scale,
        title: labelText(n.task, now),
        strong: n.task.high,
        rank: HORIZONS.indexOf(n.horizon) * 10 - (n.task.high ? 5 : 0),
        side: n.x >= 0 ? 1 : -1,
      }))
    // Ring and area names are fixed; task labels flow around them.
    const ringBoxes: Box[] = RINGS.map((ring) => {
      const y = cy - ring.outer * scale + 9
      const half = HORIZON_LABEL[ring.horizon].length * 3.3 + 4
      return { x0: cx - half, y0: y - 7, x1: cx + half, y1: y + 7 }
    })
    const hubR = HUB * scale
    const hubBox: Box = { x0: cx - hubR, y0: cy - hubR, x1: cx + hubR, y1: cy + hubR }
    return placeLabels(screenNodes, size, [hubBox, ...ringBoxes, ...areaLabels.map((a) => a.box)])
  }, [nodes, areaLabels, scale, cx, cy, size, drag?.id, now])

  const dropTarget = drag?.active ? hitCell(drag.wx, drag.wy, sectors) : null

  // Keyboard order: nearest ring first, then clockwise from 12 o'clock.
  const keyOrder = useMemo(
    () =>
      [...nodes]
        .sort((a, b) => horizonIndex(a.horizon) - horizonIndex(b.horizon) || clockAngle(a) - clockAngle(b))
        .map((n) => n.task.id),
    [nodes],
  )
  const [rovingId, setRovingId] = useState<string | null>(null)
  const tabbableId = rovingId && keyOrder.includes(rovingId) ? rovingId : keyOrder[0]

  const focusNode = (id: string | undefined): void => {
    if (!id) return
    setRovingId(id)
    containerRef.current?.querySelector<SVGGElement>(`[data-task-id="${id}"]`)?.focus()
  }

  const moveFocus = (fromId: string, key: string): void => {
    const i = keyOrder.indexOf(fromId)
    if (key === 'Home') focusNode(keyOrder[0])
    else if (key === 'End') focusNode(keyOrder[keyOrder.length - 1])
    else if (key === 'ArrowRight' || key === 'ArrowDown') focusNode(keyOrder[(i + 1) % keyOrder.length])
    else focusNode(keyOrder[(i - 1 + keyOrder.length) % keyOrder.length])
  }

  /** Pans a keyboard-focused node into view when it is off screen. */
  const ensureVisible = (node: PlacedNode): void => {
    const sx = cx + node.x * scale
    const sy = cy + node.y * scale
    const pad = 48
    if (sx > pad && sx < size.w - pad && sy > pad && sy < size.h - pad) return
    setTransform((t) => ({ ...t, x: -node.x * scale, y: -node.y * scale }))
  }

  const startNodeDrag = (e: ReactPointerEvent, node: PlacedNode): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: node.task.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, wx: node.x, wy: node.y, active: false })
  }

  const moveNodeDrag = (e: ReactPointerEvent): void => {
    if (!drag || e.pointerId !== drag.pointerId || !containerRef.current) return
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY)
    if (!drag.active && moved < DRAG_THRESHOLD) return
    const rect = containerRef.current.getBoundingClientRect()
    const w = toWorld(e.clientX - rect.left, e.clientY - rect.top)
    setDrag({ ...drag, active: true, wx: w.x, wy: w.y })
  }

  const endNodeDrag = (e: ReactPointerEvent): void => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const target = drag.active ? hitCell(drag.wx, drag.wy, sectors) : null
    if (!drag.active) select(drag.id)
    else if (target) {
      const task = tasks.find((t) => t.id === drag.id)
      const pinned = task?.due && HORIZONS.indexOf(effectiveHorizon({ ...task, horizon: target.ring.horizon }, now)) < HORIZONS.indexOf(target.ring.horizon)
      const label = `Moved to ${target.sector.area.name} · ${HORIZON_LABEL[target.ring.horizon]}`
      moveTask(drag.id, { horizon: target.ring.horizon, areaId: target.sector.area.id }, pinned ? `${label} (due date keeps it closer)` : label)
    }
    setDrag(null)
  }

  const cancelNodeDrag = (): void => setDrag(null)

  const nudge = (id: string, delta: -1 | 1): void => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    // Relative to the ring the user sees (a due date can pull a task inward).
    const next = HORIZONS[horizonIndex(effectiveHorizon(task, now)) + delta] as Horizon | undefined
    if (next) moveTask(id, { horizon: next }, `Moved to ${HORIZON_LABEL[next]}`)
  }

  const rippleArea = ripple ? areas.find((a) => a.id === ripple.areaId) : undefined
  const isEmpty = open.length === 0 && onboarded
  const focusedId = drag?.active ? drag.id : (hoverId ?? selectedId)
  const focusedNode = nodes.find((n) => n.task.id === focusedId)

  const radar = (
    <div
      ref={containerRef}
      className={`radar${phone ? ' radar--phone' : ''}${playIntro && !reduceMotion ? ' radar--intro' : ''}${drag?.active ? ' radar--dragging' : ''}`}
      {...handlers}
    >
      <h1 className="visually-hidden">Radar</h1>
      <p id="radar-key-hint" className="visually-hidden">
        Arrow keys move between tasks. Enter opens a task. Left bracket pulls it one ring closer, right bracket pushes it
        one ring out.
      </p>
      {size.w > 0 && (
        <svg className="radar__svg" width={size.w} height={size.h} role="group" aria-label="Task radar">
          <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
            <RadarRings sectors={sectors} scale={scale} />
            {dropTarget && (
              <path
                d={cellPath(dropTarget.sector, dropTarget.ring)}
                className="radar__drop"
                style={{ fill: areaColor(dropTarget.sector.area) }}
              />
            )}
            {ripple && (
              <circle key={ripple.at} r={OUTER} className="radar__ripple" style={{ stroke: areaColor(rippleArea) }} vectorEffect="non-scaling-stroke" />
            )}
            {nodes.map((node) => (
              <RadarNode
                key={node.task.id}
                node={node}
                area={visibleAreas.find((a) => a.id === node.task.areaId)}
                stale={isStale(node.task, now)}
                selected={node.task.id === selectedId}
                dragging={drag?.active === true && drag.id === node.task.id}
                dragPos={drag?.active && drag.id === node.task.id ? { x: drag.wx, y: drag.wy } : null}
                introDelay={playIntro ? introDelayFor(node) : 0}
                tabbable={node.task.id === tabbableId}
                hitR={Math.max(node.r + 12, 22 / scale)}
                dueLabel={node.task.due ? formatDue(node.task.due, now) : null}
                onArrow={(key) => moveFocus(node.task.id, key)}
                onFocusNode={() => {
                  setRovingId(node.task.id)
                  ensureVisible(node)
                }}
                onPointerDown={(e) => startNodeDrag(e, node)}
                onPointerMove={moveNodeDrag}
                onPointerUp={endNodeDrag}
                onPointerCancel={cancelNodeDrag}
                onHover={setHoverId}
                onOpen={() => select(node.task.id)}
                onNudge={(d) => nudge(node.task.id, d)}
              />
            ))}
            <RadarHub todayCount={todayCount} weekCount={weekCount} doneThisWeek={doneWeek} onOpen={() => setView('focus')} />
          </g>

          {areaLabels.map(({ sector, count, x, y }) => (
            <text key={sector.area.id} x={x} y={y} className="radar__area" textAnchor="middle" dominantBaseline="middle" style={{ fill: areaTextColor(sector.area) }}>
              {sector.area.name}
              <tspan className="radar__area-count num" dx={6}>{count}</tspan>
            </text>
          ))}

          <g className="radar__labels" fontSize={LABEL_FONT_PX}>
            {labels
              .filter((l) => l.id !== focusedId)
              .map((l) => (
                <text
                  key={l.id}
                  x={l.x}
                  y={l.y}
                  textAnchor={l.anchor}
                  dominantBaseline="middle"
                  className={`radar__label${l.strong ? ' is-strong' : ''}`}
                  aria-hidden="true"
                >
                  {l.text}
                </text>
              ))}
          </g>
          {focusedNode && <FocusedLabel node={focusedNode} pos={drag?.active ? toScreen(drag.wx, drag.wy) : toScreen(focusedNode.x, focusedNode.y)} r={focusedNode.r * scale} />}
        </svg>
      )}

      {isEmpty && (
        <div className="radar__empty">
          <p className="radar__empty-title">Nothing on your radar</p>
          <p>Type a task in the box above, or bring in a list you already have.</p>
          <button type="button" className="btn" onClick={() => setImportOpen(true)}>
            <Icon name="import" size={18} /> Import a list
          </button>
        </div>
      )}

      {areas.length < MAX_AREAS && (
        <button
          type="button"
          className="btn radar__new-area"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setNewAreaOpen(true)}
        >
          <Icon name="plus" size={16} /> New area
        </button>
      )}
      <div className="radar__controls" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          <Icon name="plus" />
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomBy(0.8)} aria-label="Zoom out">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        <button type="button" className="icon-btn" onClick={reset} aria-label="Reset view">
          <Icon name="zoomReset" />
        </button>
      </div>
      <Legend />
      {open.length > 0 && <CoachTip id="radar-drag">Drag a dot toward the middle to do it sooner. Click a dot to open it.</CoachTip>}
    </div>
  )

  // Same wrapper element either way: switching layouts must not remount the measured canvas.
  return (
    <div className={phone ? 'radar-phone' : 'radar-wrap'}>
      {radar}
      {phone && <NearList />}
    </div>
  )
}

/** Title plus a short due date when it's within a week, e.g. "Lab report · Fri". */
function labelText(task: Task, now: Date): string {
  if (!task.due) return task.title
  const days = daysBetween(todayISO(now), task.due)
  return days <= 7 ? `${truncate(task.title, 22)} · ${formatDue(task.due, now)}` : task.title
}

/** Angle clockwise from 12 o'clock, in [0, 2π). */
function clockAngle(node: PlacedNode): number {
  const a = Math.atan2(node.y, node.x) + Math.PI / 2
  return ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
}

/** Intro sweep: nodes appear as the sweep line passes their angle. */
function introDelayFor(node: PlacedNode): number {
  const angle = Math.atan2(node.y, node.x) + Math.PI / 2
  const turn = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  return Math.round((turn / (Math.PI * 2)) * 900)
}

interface FocusedLabelProps {
  node: PlacedNode
  pos: { x: number; y: number }
  r: number
}

/** Full title of the hovered, selected or dragged node, drawn above every other label. */
function FocusedLabel({ node, pos, r }: FocusedLabelProps) {
  const text = truncate(node.task.title, 60)
  const right = node.x >= 0
  return (
    <g className="radar__focus-label" aria-hidden="true">
      <text
        x={pos.x + (right ? r + 6 : -r - 6)}
        y={pos.y}
        textAnchor={right ? 'start' : 'end'}
        dominantBaseline="middle"
        fontSize={LABEL_FONT_PX + 0.5}
      >
        {text}
      </text>
    </g>
  )
}

function Legend() {
  const [open, setOpen] = useState(false)
  return (
    <div className="radar__legend" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="btn btn--ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        How to read this
      </button>
      {open && (
        <dl className="radar__legend-body">
          <div><dt><svg width="18" height="18"><circle cx="9" cy="9" r="4" className="lg-fill" /></svg></dt><dd>Small dot: quick task. Big dot: a big one.</dd></div>
          <div><dt><svg width="18" height="18"><circle cx="9" cy="9" r="5" className="lg-fill" /><circle cx="9" cy="9" r="8" className="lg-halo" /></svg></dt><dd>Halo: high priority.</dd></div>
          <div><dt><svg width="18" height="18"><circle cx="9" cy="9" r="5.5" className="lg-hollow" /></svg></dt><dd>Hollow: waiting on something.</dd></div>
          <div><dt><svg width="18" height="18"><circle cx="9" cy="9" r="5" className="lg-stale" /></svg></dt><dd>Faded, dashed: untouched for two weeks.</dd></div>
          <div><dt><span className="kbd">drag</span></dt><dd>Drag a dot to another ring or area. Closer to the middle means sooner.</dd></div>
          <div><dt><span className="kbd">[ ]</span></dt><dd>With a dot focused: pull it one ring closer or push it out. Arrow keys move between dots.</dd></div>
        </dl>
      )}
    </div>
  )
}
