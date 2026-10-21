import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { isModalOpen, isTyping } from '../appEffects'
import { horizonForDue } from '../lib/dates'
import { areaStyle, useAreaMap, useNow, useReducedMotion } from '../hooks'
import { effectiveHorizon, horizonIndex, isStale } from '../model/derive'
import { HORIZONS, HORIZON_LABEL, type Task } from '../model/types'
import { useStore } from '../store/useStore'
import './ResetView.css'

type Verdict = 'closer' | 'keep' | 'further' | 'done' | 'drop'

const DAY_MS = 86_400_000

const ACTIONS: readonly { verdict: Verdict; label: string; key: string; keys: string[] }[] = [
  { verdict: 'closer', label: 'Pull closer', key: '←', keys: ['ArrowLeft', 'ArrowUp'] },
  { verdict: 'keep', label: 'Keep', key: 'Space', keys: [' ', 'Enter'] },
  { verdict: 'further', label: 'Push out', key: '→', keys: ['ArrowRight', 'ArrowDown'] },
  { verdict: 'done', label: 'Done', key: 'D', keys: ['d'] },
  { verdict: 'drop', label: 'Drop', key: 'X', keys: ['x', 'Backspace', 'Delete'] },
]

function untouchedFor(task: Task, now: Date): string | null {
  const days = Math.floor((now.getTime() - task.updatedAt) / DAY_MS)
  if (days < 7) return null
  return days < 14 ? 'Untouched for a week' : `Untouched for ${Math.floor(days / 7)} weeks`
}

export function ResetView() {
  const tasks = useStore((s) => s.tasks)
  const lastResetAt = useStore((s) => s.prefs.lastResetAt)
  const [phase, setPhase] = useState<'intro' | 'sweep' | 'summary'>('intro')
  const [deck, setDeck] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [tally, setTally] = useState<Record<Verdict, number>>({ closer: 0, keep: 0, further: 0, done: 0, drop: 0 })
  const setPrefs = useStore((s) => s.setPrefs)
  const now = useNow()

  const ordered = useMemo(
    () =>
      tasks
        .filter((t) => !t.done)
        .sort(
          (a, b) =>
            Number(isStale(b, now)) - Number(isStale(a, now)) ||
            a.updatedAt - b.updatedAt,
        )
        .map((t) => t.id),
    [tasks, now],
  )

  const start = (): void => {
    setDeck(ordered)
    setIndex(0)
    setTally({ closer: 0, keep: 0, further: 0, done: 0, drop: 0 })
    setPhase(ordered.length ? 'sweep' : 'summary')
  }

  const advance = (verdict: Verdict | null): void => {
    if (verdict) setTally((t) => ({ ...t, [verdict]: t[verdict] + 1 }))
    if (index + 1 >= deck.length) {
      setPrefs({ lastResetAt: Date.now() })
      setPhase('summary')
    } else setIndex(index + 1)
  }

  if (phase === 'intro') {
    return (
      <div className="reset reset--intro">
        <h1>Weekly reset</h1>
        <p>
          A new week is the easiest time to start fresh. Go through each open task once: pull it closer, keep it, push
          it out, or let it go. About three minutes.
        </p>
        <p className="reset__sub num">
          {ordered.length} open {ordered.length === 1 ? 'task' : 'tasks'}
          {lastResetAt ? ` · last reset ${new Date(lastResetAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
        </p>
        <button type="button" className="btn btn--primary reset__start" onClick={start} disabled={ordered.length === 0}>
          Start reset
        </button>
      </div>
    )
  }

  if (phase === 'summary') return <Summary tally={tally} onAgain={() => setPhase('intro')} />

  const task = tasks.find((t) => t.id === deck[index])
  return (
    <div className="reset">
      <div
        className="reset__progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={deck.length}
        aria-valuenow={index + 1}
        aria-valuetext={`${index + 1} of ${deck.length}`}
        aria-label="Reset progress"
      >
        <span style={{ width: `${(index / deck.length) * 100}%` }} />
      </div>
      <p className="reset__count num" aria-hidden="true">
        {index + 1} of {deck.length}
      </p>
      <p className="visually-hidden" role="status">
        {task ? `${index + 1} of ${deck.length}: ${task.title}` : ''}
      </p>
      <AnimatePresence mode="wait">
        {task ? (
          <SweepCard key={task.id} task={task} now={now} onVerdict={advance} />
        ) : (
          <SkipMissing key={deck[index]} onSkip={() => advance(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

/** A task deleted elsewhere mid-sweep is skipped silently (and not counted). */
function SkipMissing({ onSkip }: { onSkip: () => void }) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    onSkip()
  }, [onSkip])
  return null
}

interface SweepCardProps {
  task: Task
  now: Date
  onVerdict: (v: Verdict) => void
}

function SweepCard({ task, now, onVerdict }: SweepCardProps) {
  const updateTask = useStore((s) => s.updateTask)
  const setDone = useStore((s) => s.setDone)
  const deleteTask = useStore((s) => s.deleteTask)
  const area = useAreaMap().get(task.areaId)
  const reduce = useReducedMotion()
  const current = effectiveHorizon(task, now)
  // Moves are relative to the ring the user sees, which a due date may have pulled in.
  const idx = horizonIndex(current)
  const dueRing = horizonForDue(task.due, now)
  const pinnedByDue = dueRing !== null && horizonIndex(dueRing) <= idx
  const stale = untouchedFor(task, now)
  const handled = useRef(false)

  const apply = (verdict: Verdict): void => {
    // The card lingers while animating out; ignore repeat clicks and keys meant for the next card.
    if (handled.current) return
    handled.current = true
    if (verdict === 'closer') updateTask(task.id, { horizon: HORIZONS[Math.max(0, idx - 1)] })
    if (verdict === 'further') updateTask(task.id, { horizon: HORIZONS[Math.min(HORIZONS.length - 1, idx + 1)] })
    if (verdict === 'keep') updateTask(task.id, {})
    if (verdict === 'done') setDone(task.id, true)
    if (verdict === 'drop') deleteTask(task.id)
    onVerdict(verdict)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e.target) || isModalOpen()) return
      if (!useStore.getState().prefs.shortcuts) return
      if (e.target instanceof HTMLElement && e.target.closest('.detail')) return
      const tag = e.target instanceof HTMLElement ? e.target.tagName : ''
      // A focused button already activates on Space/Enter; don't apply twice.
      if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return
      const action = ACTIONS.find((a) => a.keys.includes(e.key))
      if (!action) return
      e.preventDefault()
      apply(action.verdict)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <motion.article
      className="reset__card"
      style={areaStyle(area)}
      initial={reduce ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? undefined : { opacity: 0, x: -24 }}
      transition={{ duration: 0.18 }}
    >
      <p className="reset__meta">
        <span className="dot" /> {area?.name}
      </p>
      <h2 className="reset__title">{task.title}</h2>
      <RingScale current={current} />
      {stale && <p className="reset__stale">{stale}</p>}
      <div className="reset__actions">
        {ACTIONS.map((a) => (
          <button
            key={a.verdict}
            type="button"
            className={`btn reset__btn reset__btn--${a.verdict}`}
            onClick={() => apply(a.verdict)}
            disabled={(a.verdict === 'closer' && idx === 0) || (a.verdict === 'further' && (idx === HORIZONS.length - 1 || pinnedByDue))}
            title={a.verdict === 'further' && pinnedByDue ? 'Its due date keeps it here' : undefined}
          >
            {a.label} <span className="kbd">{a.key}</span>
          </button>
        ))}
      </div>
    </motion.article>
  )
}

function RingScale({ current }: { current: (typeof HORIZONS)[number] }) {
  return (
    <ol className="reset__scale" aria-label={`Currently ${HORIZON_LABEL[current]}`}>
      {HORIZONS.map((h) => (
        <li key={h} className={h === current ? 'is-current' : undefined}>
          {HORIZON_LABEL[h]}
        </li>
      ))}
    </ol>
  )
}

function Summary({ tally, onAgain }: { tally: Record<Verdict, number>; onAgain: () => void }) {
  const setView = useStore((s) => s.setView)
  const reviewed = Object.values(tally).reduce((a, b) => a + b, 0)
  const lines = [
    [tally.closer, 'pulled closer'],
    [tally.keep, 'kept as is'],
    [tally.further, 'pushed out'],
    [tally.done, 'marked done'],
    [tally.drop, 'dropped'],
  ] as const
  return (
    <div className="reset reset--intro">
      <h1>Fresh week</h1>
      <p className="num">You went through {reviewed} {reviewed === 1 ? 'task' : 'tasks'}.</p>
      <ul className="reset__summary num">
        {lines
          .filter(([n]) => n > 0)
          .map(([n, label]) => (
            <li key={label}>
              <strong>{n}</strong> {label}
            </li>
          ))}
      </ul>
      <div className="reset__end-actions">
        <button type="button" className="btn btn--primary" onClick={() => setView('radar')}>
          See the radar
        </button>
        <button type="button" className="btn" onClick={() => setView('focus')}>
          Start on today
        </button>
        <button type="button" className="btn btn--ghost" onClick={onAgain}>
          Back
        </button>
      </div>
    </div>
  )
}
