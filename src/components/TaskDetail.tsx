import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { areaStyle, useAreaMap, useMediaQuery, useNow } from '../hooks'
import { effectiveHorizon } from '../model/derive'
import {
  EFFORT_LABEL,
  HORIZONS,
  HORIZON_LABEL,
  PRIORITY_LABEL,
  priorityOf,
  type Effort,
  type Horizon,
  type Priority,
  type Task,
} from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { AfterField, DueField, LinkChips, RepeatField } from './DetailFields'
import { StepList } from './StepList'
import './TaskDetail.css'

const EFFORTS: readonly Effort[] = ['s', 'm', 'l']
const PRIORITIES: readonly Priority[] = ['high', 'normal', 'low']

/** Open "More options" automatically when any of those fields already has a value. */
const hasExtras = (t: Task): boolean =>
  Boolean(t.plan || t.waiting || t.notes || (t.repeat && t.repeat !== 'none') || t.effort !== 'm')

const HORIZON_SHORT: Record<Horizon, string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  later: 'Later',
  someday: 'Someday',
}

export function TaskDetail() {
  const task = useStore((s) => s.tasks.find((t) => t.id === s.selectedId) ?? null)
  const select = useStore((s) => s.select)
  const isPhone = useMediaQuery('(max-width: 760px)')

  return (
    <AnimatePresence>
      {task && (
        <motion.aside
          key="detail"
          className="detail"
          aria-label="Task details"
          initial={isPhone ? { y: '100%' } : { x: 40, opacity: 0 }}
          animate={isPhone ? { y: 0 } : { x: 0, opacity: 1 }}
          exit={isPhone ? { y: '100%' } : { x: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            // Blur first so a half-typed title or step is committed before the drawer closes.
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
            select(null)
          }}
        >
          <DetailBody key={task.id} task={task} />
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function DetailBody({ task }: { task: Task }) {
  const areas = useStore((s) => s.areas)
  const updateTask = useStore((s) => s.updateTask)
  const moveTask = useStore((s) => s.moveTask)
  const setDone = useStore((s) => s.setDone)
  const deleteTask = useStore((s) => s.deleteTask)
  const select = useStore((s) => s.select)
  const startFocus = useStore((s) => s.startFocus)
  const area = useAreaMap().get(task.areaId)
  const now = useNow()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [title, setTitle] = useState(task.title)
  // Decided once per task (the body is keyed by id), so clearing a field doesn't snap the section shut.
  const [moreOpen, setMoreOpen] = useState(() => hasExtras(task))
  // Re-sync the draft when the stored title changes underneath us (e.g. Undo).
  const [syncedTitle, setSyncedTitle] = useState(task.title)
  if (syncedTitle !== task.title) {
    setSyncedTitle(task.title)
    setTitle(task.title)
  }

  useEffect(() => {
    // Remember what opened the drawer so focus can return there when it closes.
    // (Ignore our own controls: StrictMode re-runs this after Close already has focus.)
    const active = document.activeElement
    const opener = active instanceof HTMLElement && !active.closest('.detail') ? active : null
    const taskId = task.id
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      const target =
        (opener?.isConnected ? opener : null) ??
        document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`) ??
        document.getElementById('main')
      requestAnimationFrame(() => {
        if (!document.activeElement || document.activeElement === document.body) target?.focus({ preventScroll: true })
      })
    }
    // Runs once per opened task; DetailBody is keyed by task id.
  }, [task.id])

  const effective = effectiveHorizon(task, now)
  const commitTitle = (): void => {
    const clean = title.trim()
    if (clean && clean !== task.title) updateTask(task.id, { title: clean.slice(0, 300) })
    else setTitle(task.title)
  }

  return (
    <div className="detail__inner" style={areaStyle(area)}>
      <div className="detail__top">
        <label className="detail__area">
          <span className="dot" />
          <select
            value={task.areaId}
            onChange={(e) => moveTask(task.id, { areaId: e.target.value }, 'Moved to another area')}
            aria-label="Area"
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button ref={closeRef} type="button" className="icon-btn" onClick={() => select(null)} aria-label="Close details">
          <Icon name="close" />
        </button>
      </div>

      <textarea
        className="detail__title"
        value={title}
        rows={2}
        aria-label="Title"
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />

      <LinkChips task={task} />

      <div className="detail__group">
        <span className="detail__label">When</span>
        <div className="detail__chips" role="group" aria-label="Ring">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              className="chip"
              aria-pressed={effective === h}
              aria-label={HORIZON_LABEL[h]}
              onClick={() => moveTask(task.id, { horizon: h }, `Moved to ${HORIZON_LABEL[h]}`)}
            >
              {HORIZON_SHORT[h]}
            </button>
          ))}
        </div>
        {effective !== task.horizon && task.due && (
          <p className="detail__note">The due date keeps it in {HORIZON_LABEL[effective]}.</p>
        )}
      </div>

      <DueField task={task} now={now} />

      <div className="detail__group">
        <span className="detail__label">Priority</span>
        <div className="seg detail__prio" role="group" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={priorityOf(task) === p}
              onClick={() => updateTask(task.id, { high: p === 'high', low: p === 'low' })}
            >
              <span className="prio" data-level={p}>
                <i />
                <i />
                <i />
              </span>
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <section className="detail__group" aria-labelledby="steps-h">
        <h3 id="steps-h" className="detail__label">
          Steps
        </h3>
        <StepList task={task} />
      </section>

      <AfterField task={task} />

      <details className="detail__more" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
        <summary>
          <Icon name="chevron" size={14} /> More options
        </summary>
        <div className="detail__more-body">
          <div className="detail__row">
            <RepeatField task={task} />
            <div className="seg seg--small" role="group" aria-label="Size">
              {EFFORTS.map((e) => (
                <button key={e} type="button" aria-pressed={task.effort === e} onClick={() => updateTask(task.id, { effort: e })}>
                  {EFFORT_LABEL[e]}
                </button>
              ))}
            </div>
          </div>
          <label className="detail__group">
            <span className="detail__label">I’ll do it…</span>
            <input
              className="field"
              value={task.plan ?? ''}
              placeholder="e.g. Tuesday after class, at the library"
              onChange={(e) => updateTask(task.id, { plan: e.target.value || null })}
              maxLength={200}
            />
          </label>
          <label className="detail__group">
            <span className="detail__label">Waiting on</span>
            <input
              className="field"
              value={task.waiting ?? ''}
              placeholder="e.g. rec letter from Dr. Lee"
              onChange={(e) => updateTask(task.id, { waiting: e.target.value || null })}
              maxLength={200}
            />
          </label>
          <label className="detail__group">
            <span className="detail__label">Notes</span>
            <textarea
              className="field"
              rows={4}
              value={task.notes}
              placeholder="Details, links, anything"
              onChange={(e) => updateTask(task.id, { notes: e.target.value.slice(0, 5000) })}
            />
          </label>
        </div>
      </details>

      {task.spentMinutes > 0 && (
        <p className="detail__meta num">{Math.round(task.spentMinutes)} min spent in Focus</p>
      )}
      <div className="detail__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setDone(task.id, !task.done)
            if (!task.done) select(null)
          }}
        >
          <Icon name="check" size={18} /> {task.done ? 'Mark not done' : 'Mark done'}
        </button>
        {!task.done && (
          <button type="button" className="btn" onClick={() => startFocus(task.id)}>
            <Icon name="focus" size={18} /> Focus
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--danger" onClick={() => deleteTask(task.id)}>
          <Icon name="trash" size={18} /> Delete
        </button>
      </div>
    </div>
  )
}
