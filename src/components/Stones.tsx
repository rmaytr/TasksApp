import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '../hooks'

const MAX_STONES = 9
const GHOSTS = 3
const STONE_H = 24
const STEP = STONE_H - 5
// Small, fixed offsets so the stack looks hand-built rather than machine-centered.
const SHIFT = [0, -5, 4, -3, 6, -6, 2, -2, 5]

/**
 * A cairn that grows by one stone for every thing you finish in a Lock-in session.
 * With nothing finished yet it shows a faint outline of the stack to come. The newest
 * stone drops onto the stack; with reduced motion it simply appears.
 */
export function Stones({ count, size = 140 }: { count: number; size?: number }) {
  const reduce = useReducedMotion()
  const shown = Math.min(count, MAX_STONES)
  const layers = Math.max(shown, GHOSTS)
  const height = 10 + layers * STEP + STONE_H
  const stone = (i: number) => ({ cx: 80 + (SHIFT[i] ?? 0), cy: height - 6 - STONE_H / 2 - i * STEP, rx: (104 - i * 11) / 2, ry: STONE_H / 2 })

  return (
    <svg
      className="stones"
      width={size}
      height={(size / 160) * height}
      viewBox={`0 0 160 ${height}`}
      role="img"
      aria-label={count === 0 ? 'An empty cairn, ready for stones' : `A cairn of ${count} ${count === 1 ? 'stone' : 'stones'}`}
    >
      <ellipse cx="80" cy={height - 4} rx="64" ry="4" className="stones__ground" />
      {shown === 0 &&
        Array.from({ length: GHOSTS }, (_, i) => <ellipse key={`g${i}`} {...stone(i)} className="stones__ghost" />)}
      <AnimatePresence initial={false}>
        {Array.from({ length: shown }, (_, i) => (
          <motion.ellipse
            key={i}
            {...stone(i)}
            className={i === shown - 1 ? 'stones__stone stones__stone--top' : 'stones__stone'}
            initial={reduce ? false : { y: -70, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18 }}
          />
        ))}
      </AnimatePresence>
    </svg>
  )
}
