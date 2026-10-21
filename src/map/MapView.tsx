import { useEffect, useMemo, useRef, useState } from 'react'
import { areaColor, useMediaQuery, useNow } from '../hooks'
import { MAX_AREAS } from '../model/defaults'
import { compareUrgency } from '../model/derive'
import type { Task } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from '../components/Icon'
import { usePanZoom } from '../radar/usePanZoom'
import { layoutMap, type MapLink, type MapMode } from './layout'
import { MapNodeView } from './MapNodeView'
import './Map.css'

const FIT_PAD = 40

function linkPath(link: MapLink): string {
  const { from, to } = link
  if (link.mode === 'outline') return `M ${from.x} ${to.y - 26} V ${to.y} H ${to.x}`
  const mid = (from.x + to.x) / 2
  return `M ${from.x} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${to.x} ${to.y}`
}

export function MapView() {
  const areas = useStore((s) => s.areas)
  const tasks = useStore((s) => s.tasks)
  const hidden = useStore((s) => s.prefs.hiddenAreas)
  const now = useNow()
  const narrow = useMediaQuery('(max-width: 760px)')
  const mode: MapMode = narrow ? 'outline' : 'mindmap'
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const visibleAreas = useMemo(() => areas.filter((a) => !hidden.includes(a.id)), [areas, hidden])
  const tasksByArea = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) if (!t.done) map.set(t.areaId, [...(map.get(t.areaId) ?? []), t])
    for (const list of map.values()) list.sort((a, b) => compareUrgency(a, b, now))
    return map
  }, [tasks, now])

  const layout = useMemo(
    () =>
      layoutMap(
        {
          areas: visibleAreas,
          tasksByArea,
          collapsedAreas: collapsed,
          expandedTasks: expanded,
          canAddArea: areas.length < MAX_AREAS,
        },
        mode,
        Math.max(260, size.w - 24),
      ),
    [visibleAreas, tasksByArea, collapsed, expanded, areas.length, mode, size.w],
  )

  const { transform, setTransform, zoomBy, handlers } = usePanZoom(containerRef, size)
  const fit = (): void => {
    const { x0, y0, x1, y1 } = layout.bounds
    if (!size.w || !Number.isFinite(x0)) return
    const k = Math.min(1, (size.w - FIT_PAD * 2) / (x1 - x0), (size.h - FIT_PAD * 2) / (y1 - y0))
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    setTransform({ k: Math.max(0.6, k), x: -cx * Math.max(0.6, k), y: -cy * Math.max(0.6, k) })
  }
  // Fit once when the canvas first has a size; afterwards the user's pan/zoom is kept.
  const fitted = useRef(false)
  const fitRef = useRef(fit)
  useEffect(() => {
    fitRef.current = fit
  })
  useEffect(() => {
    if (mode !== 'mindmap' || fitted.current || !size.w) return
    fitted.current = true
    fitRef.current()
  }, [size.w, mode])

  const toggle = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  const content = (
    <>
      <svg className="map__links" aria-hidden="true" style={{ overflow: 'visible' }} width="1" height="1">
        {layout.links.map((link) => (
          <path key={link.key} d={linkPath(link)} style={{ stroke: areaColor(link.area) }} />
        ))}
      </svg>
      <ul className="map__nodes" aria-label="Map of areas and tasks" onPointerDown={(e) => e.stopPropagation()}>
        {layout.nodes.map((node) => (
          <MapNodeView
            key={node.key}
            node={node}
            mode={mode}
            now={now}
            taskCount={node.area ? (tasksByArea.get(node.area.id)?.length ?? 0) : tasks.filter((t) => !t.done).length}
            collapsed={node.area ? collapsed.has(node.area.id) : false}
            expanded={node.task ? expanded.has(node.task.id) : false}
            onToggleArea={(id) => setCollapsed((s) => toggle(s, id))}
            onToggleTask={(id) => setExpanded((s) => toggle(s, id))}
          />
        ))}
      </ul>
    </>
  )

  if (mode === 'outline') {
    return (
      <div className="map map--outline" ref={containerRef}>
        <h1 className="visually-hidden">Map</h1>
        <div className="map__outline-inner" style={{ height: layout.bounds.y1 + 24 }}>
          {content}
        </div>
      </div>
    )
  }

  return (
    <div
      className="map map--mindmap"
      ref={containerRef}
      {...handlers}
      onScroll={(e) => {
        const el = e.currentTarget
        if (!el.scrollLeft && !el.scrollTop) return
        const { scrollLeft, scrollTop } = el
        el.scrollTo(0, 0)
        setTransform((t) => ({ ...t, x: t.x - scrollLeft, y: t.y - scrollTop }))
      }}
    >
      <h1 className="visually-hidden">Map</h1>
      <div
        className="map__canvas"
        style={{
          transform: `translate(${size.w / 2 + transform.x}px, ${size.h / 2 + transform.y}px) scale(${transform.k})`,
        }}
      >
        {content}
      </div>
      <div className="map__controls" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
          <Icon name="plus" />
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomBy(0.83)} aria-label="Zoom out">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="icon-btn" onClick={fit} aria-label="Fit to screen">
          <Icon name="zoomReset" />
        </button>
      </div>
    </div>
  )
}
