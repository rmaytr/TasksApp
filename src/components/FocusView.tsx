import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDue } from '../lib/dates'
import { areaStyle, useAreaMap, useNow, useReducedMotion } from '../hooks'
import { compareUrgency, effectiveHorizon, nextStep } from '../model/derive'
import { EFFORT_LABEL, EFFORT_MINUTES, HORIZON_LABEL, type Task } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { StepList } from './StepList'
import './FocusView.css'

const SESSION_MINUTES = 25

export function FocusView() {
  const tasks = useStore((s) => s.tasks)
  const hidden = useStore((s) => s.prefs.hiddenAreas)
  const focusTaskId = useStore((s) => s.focusTaskId)
  const startFocus = useStore((s) => s.startFocus)
  const setView = useStore((s) => s.setView)
  const [skipped, setSkipped] = useState<string[]>([])
  const now = useNow()

  const queue = useMemo(
    () =>
      tasks
        .filter((t) => !t.done && !hidden.includes(t.areaId) && !skipped.includes(t.id))
        .sort((a, b) => compareUrgency(a, b, now)),
    [tasks, hidden, skipped, now],
  )
  const pinned = tasks.find((t) => t.id === focusTaskId && !t.done)
  const current = pinned ?? queue[0]
  const upNext = queue.filter((t) => t.id !== current?.id).slice(0, 3)

  if (!current) {
    return (
      <div className="focus focus--empty">
        <h1>All clear</h1>
        <p>{skipped.length ? 'You skipped the rest for now.' : 'Nothing open on your radar.'}</p>
        <div className="focus__empty-actions">
          {skipped.length > 0 && (
            <button type="button" className="btn" onClick={() => setSkipped([])}>
              Show skipped tasks again
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => setView('radar')}>
            Back to radar
          </button>
        </div>
      </div>
    )
  }

  const skip = (): void => {
    setSkipped((s) => [...s, current.id])
    startFocus(null)
  }

  return (
    <div className="focus">
      <AnimatePresence mode="wait">
        <FocusCard key={current.id} task={current} now={now} onSkip={skip} />
      </AnimatePresence>
      {upNext.length > 0 && (
        <section className="focus__next" aria-labelledby="up-next">
          <h2 id="up-next">Up next</h2>
          <ul>
            {upNext.map((t) => (
              <UpNextItem key={t.id} task={t} onPick={() => startFocus(t.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function UpNextItem({ task, onPick }: { task: Task; onPick: () => void }) {
  const area = useAreaMap().get(task.areaId)
  return (
    <li>
      <button type="button" className="focus__next-item" style={areaStyle(area)} onClick={onPick}>
        <span className="dot" />
        {task.title}
      </button>
    </li>
  )
}

interface FocusCardProps {
  task: Task
  now: Date
  onSkip: () => void
}

function FocusCard({ task, now, onSkip }: FocusCardProps) {
  const setDone = useStore((s) => s.setDone)
  const updateTask = useStore((s) => s.updateTask)
  const updateStep = useStore((s) => s.updateStep)
  const moveTask = useStore((s) => s.moveTask)
  const startFocus = useStore((s) => s.startFocus)
  const area = useAreaMap().get(task.areaId)
  const reduce = useReducedMotion()
  const step = nextStep(task)
  const horizon = effectiveHorizon(task, now)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // When Done / Not now unmounts the button that had focus, land on the next task's title.
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) {
      titleRef.current?.focus({ preventScroll: true })
    }
  }, [])

  const finish = (): void => {
    setDone(task.id, true)
    startFocus(null)
  }

  return (
    <motion.article
      className="focus__card"
      style={areaStyle(area)}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -16, scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby="focus-title"
    >
      <p className="focus__meta">
        <span className="dot" />
        {area?.name} · {HORIZON_LABEL[horizon]}
        {task.due && <> · due {formatDue(task.due, now)}</>}
        {task.high && <span className="tag tag--high">High</span>}
      </p>
      <h1 id="focus-title" className="focus__title" ref={titleRef} tabIndex={-1}>
        {task.title}
      </h1>

      {step && (
        <label className="focus__step">
          <input
            type="checkbox"
            className="check check--square"
            checked={false}
            onChange={() => updateStep(task.id, step.id, { done: true })}
          />
          <span>
            <span className="focus__step-label">Next step</span>
            {step.title}
          </span>
        </label>
      )}

      <PlanPrompt task={task} onSave={(plan) => updateTask(task.id, { plan })} />

      {task.waiting && <p className="focus__waiting">Waiting on {task.waiting}</p>}

      {task.steps.length > 0 && (
        <details className="focus__all-steps">
          <summary>
            All steps ({task.steps.filter((s) => s.done).length}/{task.steps.length})
          </summary>
          <StepList task={task} compact />
        </details>
      )}

      <FocusTimer task={task} onCommit={(minutes) => updateTask(task.id, { spentMinutes: task.spentMinutes + minutes })} />

      <div className="focus__actions">
        <button type="button" className="btn btn--primary focus__done" onClick={finish}>
          <Icon name="check" size={18} /> Done
        </button>
        <button type="button" className="btn" onClick={onSkip}>
          Not now
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            moveTask(task.id, { horizon: 'later' }, 'Pushed to Later')
            startFocus(null)
          }}
        >
          Push to later
        </button>
      </div>
    </motion.article>
  )
}

/** The implementation-intention prompt: naming a when/where roughly doubles follow-through. */
function PlanPrompt({ task, onSave }: { task: Task; onSave: (plan: string | null) => void }) {
  const [editing, setEditing] = useState(!task.plan)
  const [value, setValue] = useState(task.plan ?? '')
  const savedRef = useRef<HTMLButtonElement>(null)
  const justSaved = useRef(false)

  useEffect(() => {
    if (!editing && justSaved.current) savedRef.current?.focus()
    justSaved.current = false
  }, [editing])

  if (!editing && task.plan) {
    return (
      <button ref={savedRef} type="button" className="focus__plan focus__plan--set" onClick={() => setEditing(true)}>
        <Icon name="clock" size={18} />
        <span>I’ll do it {task.plan}</span>
      </button>
    )
  }
  return (
    <form
      className="focus__plan"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(value.trim() || null)
        justSaved.current = true
        setEditing(false)
      }}
    >
      <label htmlFor="plan-input">I’ll do it…</label>
      <input
        id="plan-input"
        className="field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="tonight after dinner, at my desk"
        maxLength={200}
      />
      <button type="submit" className="btn">
        Save
      </button>
    </form>
  )
}

interface FocusTimerProps {
  task: Task
  onCommit: (minutes: number) => void
}

function FocusTimer({ task, onCommit }: FocusTimerProps) {
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [finished, setFinished] = useState(false)
  const startedAt = useRef<number | null>(null)
  const banked = useRef(0)
  const commitRef = useRef(onCommit)
  useEffect(() => {
    commitRef.current = onCommit
  }, [onCommit])

  useEffect(() => {
    if (!running) return
    const limit = SESSION_MINUTES * 60_000
    const id = setInterval(() => {
      const ms = Math.min(limit, banked.current + Date.now() - (startedAt.current ?? Date.now()))
      setElapsed(ms)
      if (ms >= limit) {
        // Bank the full session right away and reset, so the next session starts fresh.
        commitRef.current(SESSION_MINUTES)
        banked.current = 0
        startedAt.current = null
        setElapsed(0)
        setRunning(false)
        setFinished(true)
      }
    }, 500)
    return () => clearInterval(id)
  }, [running])

  // Bank tracked time when the card unmounts (task done, skipped, or view changed).
  useEffect(
    () => () => {
      const ms = banked.current + (startedAt.current ? Date.now() - startedAt.current : 0)
      if (ms >= 30_000) commitRef.current(ms / 60_000)
    },
    [],
  )

  const toggle = (): void => {
    if (running) {
      banked.current += Date.now() - (startedAt.current ?? Date.now())
      startedAt.current = null
    } else {
      startedAt.current = Date.now()
      setFinished(false)
    }
    setRunning(!running)
  }

  const remaining = Math.max(0, SESSION_MINUTES * 60_000 - elapsed)
  const mm = Math.floor(remaining / 60_000)
  const ss = Math.floor((remaining % 60_000) / 1000)
  const fraction = elapsed / (SESSION_MINUTES * 60_000)
  const spent = Math.round(task.spentMinutes + elapsed / 60_000)
  const c = 2 * Math.PI * 22

  return (
    <div className="focus__timer">
      <button type="button" className="focus__timer-btn" onClick={toggle} aria-label={running ? 'Pause timer' : 'Start a 25-minute focus timer'}>
        <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
          <circle cx="28" cy="28" r="22" className="focus__timer-track" />
          <circle
            cx="28"
            cy="28"
            r="22"
            className="focus__timer-fill"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - fraction)}
            transform="rotate(-90 28 28)"
          />
        </svg>
        <span className="focus__timer-icon">
          <Icon name={running ? 'pause' : 'play'} size={18} />
        </span>
      </button>
      <div className="focus__timer-text">
        <span className="focus__clock num" aria-live="off">
          {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
        </span>
        <span className="visually-hidden" role="status">
          {finished ? 'Focus session finished. Nice work.' : ''}
        </span>
        <span className="focus__estimate num">
          {EFFORT_LABEL[task.effort]} task, about {EFFORT_MINUTES[task.effort]} min
          {spent > 0 && ` · ${spent} min so far`}
        </span>
      </div>
    </div>
  )
}
