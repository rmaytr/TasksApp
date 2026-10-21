import { useId, type KeyboardEvent } from 'react'
import { HORIZON_LABEL } from '../model/types'
import { HUB, OUTER, polar, RINGS, type Sector } from './layout'

/** Each ring is a full disc, so tints stack: Today ends up ~5x darker than Someday. */
const RING_TINT = 0.022

/** Px size of ring names; divided by the scale so text stays the same size when zooming. */
const RING_LABEL_PX = 11

/** Arc centered at 12 o'clock, used as a textPath so ring names curve along their ring. */
function arcPath(radius: number): string {
  const spread = 0.6
  const a = polar(-Math.PI / 2 - spread, radius)
  const b = polar(-Math.PI / 2 + spread, radius)
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y}`
}

interface RingsProps {
  sectors: readonly Sector[]
  scale: number
}

/** Rings tinted strongest near the middle (sooner) and spokes between areas, in world space. */
export function RadarRings({ sectors, scale }: RingsProps) {
  const fontSize = RING_LABEL_PX / scale
  const uid = useId()
  return (
    <g className="radar__rings">
      <defs>
        {RINGS.map((ring) => (
          <path
            key={ring.horizon}
            id={`${uid}-ring-${ring.horizon}`}
            // Text sits above its path, so run the path one line-height inside the ring's edge.
            d={arcPath(Math.max(ring.outer - (RING_LABEL_PX + 4) / scale, ring.inner + 4))}
          />
        ))}
      </defs>
      {[...RINGS].reverse().map((ring) => (
        <circle
          key={ring.horizon}
          r={ring.outer}
          className="radar__ring"
          style={{ fillOpacity: RING_TINT }}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {sectors.length > 1 &&
        sectors.map((s) => {
          const a = polar(s.start, HUB)
          const b = polar(s.start, OUTER)
          return <line key={s.area.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="radar__spoke" vectorEffect="non-scaling-stroke" />
        })}
      {RINGS.map((ring) => (
        <text key={ring.horizon} className="radar__ring-label" fontSize={fontSize}>
          <textPath href={`#${uid}-ring-${ring.horizon}`} startOffset="50%" textAnchor="middle">
            {HORIZON_LABEL[ring.horizon]}
          </textPath>
        </text>
      ))}
    </g>
  )
}

interface HubProps {
  todayCount: number
  weekCount: number
  doneThisWeek: number
  onOpen: () => void
}

/**
 * The center: what's due today (or "Clear" when nothing is), with an arc that fills
 * as this week's tasks get done. Opens Focus.
 */
export function RadarHub({ todayCount, weekCount, doneThisWeek, onOpen }: HubProps) {
  const total = doneThisWeek + todayCount + weekCount
  const fraction = total === 0 ? 0 : doneThisWeek / total
  const r = HUB - 3
  const circumference = 2 * Math.PI * r
  const clear = todayCount === 0
  const label = clear
    ? `Nothing due today. ${weekCount} this week, ${doneThisWeek} done this week. Open Focus`
    : `${todayCount} for today, ${doneThisWeek} done this week. Open Focus`

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onOpen()
  }

  return (
    <g
      className={`radar__hub${clear ? ' is-clear' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      <circle r={HUB - 6} className="radar__hub-disc" />
      <circle r={r} className="radar__hub-track" vectorEffect="non-scaling-stroke" />
      {fraction > 0 && (
        <circle
          r={r}
          className="radar__hub-done"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          transform="rotate(-90)"
        />
      )}
      <circle r={HUB + 2} className="radar__hub-ring" vectorEffect="non-scaling-stroke" />
      {clear ? (
        <>
          <text y={-5} className="radar__hub-count" fontSize={20}>
            Clear
          </text>
          <text y={16} className="radar__hub-label num" fontSize={11.5}>
            {weekCount} this week
          </text>
        </>
      ) : (
        <>
          <text y={-5} className="radar__hub-count num" fontSize={30}>
            {todayCount}
          </text>
          <text y={18} className="radar__hub-label" fontSize={12}>
            for today
          </text>
        </>
      )}
    </g>
  )
}
