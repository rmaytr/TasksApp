import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { areaStyle, useAreaMap, useMediaQuery, useNow } from '../hooks'
import { effectiveHorizon } from '../model/derive'
import { EFFORT_LABEL, HORIZONS, HORIZON_LABEL, type Effort, type Horizon, type Task } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { DueField, LinkChips, OptionalField, RepeatField } from './DetailFields'
import { StepList } from './StepList'
import './TaskDetail.css'

const EFFORTS: readonly Effort[] = ['s', 'm', 'l']

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
  // Re-sync the draft when the stored title changes underneath us (e.g. Undo).
  const [syncedTitle, setSyncedTitle] = useState(task.title)
  if (syncedTitle !== task.title) {
    setSyncedTitle(task.title)
    setTitle(task.title)
  }

  useEffect(() => {
    // Remember what opened the drawer so focus can return there when it closes.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const taskId = task.id
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      const target =
        opener?.isConnected ? opener : document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)
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

      <fieldset className="detail__group">
        <legend>When</legend>
        <div className="seg seg--rings" role="group" aria-label="Ring">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={task.horizon === h}
              aria-label={HORIZON_LABEL[h]}
              className={effective === h && task.horizon !== h ? 'seg__pinned' : undefined}
              onClick={() => moveTask(task.id, { horizon: h }, `Moved to ${HORIZON_LABEL[h]}`)}
            >
              {HORIZON_SHORT[h]}
            </button>
          ))}
        </div>
        {effective !== task.horizon && task.due && (
          <p className="detail__note">The due date keeps it in {HORIZON_LABEL[effective]}.</p>
        )}
        <DueField task={task} now={now} />
        <div className="detail__row">
          <RepeatField task={task} />
          <label className="detail__toggle">
            <input
              type="checkbox"
              className="check check--square"
              checked={task.high}
              onChange={(e) => updateTask(task.id, { high: e.target.checked })}
            />
            High priority
          </label>
        </div>
      </fieldset>

      <label className="detail__group detail__plan">
        <span className="detail__label">I’ll do it…</span>
        <input
          className="field"
          value={task.plan ?? ''}
          placeholder="e.g. Tuesday after class, at the library"
          onChange={(e) => updateTask(task.id, { plan: e.target.value || null })}
          maxLength={200}
        />
      </label>

      <section className="detail__group" aria-labelledby="steps-h">
        <h3 id="steps-h" className="detail__label">
          Steps
        </h3>
        <StepList task={task} />
      </section>

      <div className="detail__group">
        <span className="detail__label">Size</span>
        <div className="seg seg--small" role="group" aria-label="Size">
          {EFFORTS.map((e) => (
            <button key={e} type="button" aria-pressed={task.effort === e} onClick={() => updateTask(task.id, { effort: e })}>
              {EFFORT_LABEL[e]}
            </button>
          ))}
        </div>
      </div>

      <div className="detail__optional">
        <OptionalField label="Waiting on" addLabel="Waiting on someone" hasValue={Boolean(task.waiting)}>
          <input
            className="field"
            value={task.waiting ?? ''}
            placeholder="e.g. rec letter from Dr. Lee"
            onChange={(e) => updateTask(task.id, { waiting: e.target.value || null })}
            maxLength={200}
            autoFocus={!task.waiting}
          />
        </OptionalField>
        <OptionalField label="Notes" addLabel="Notes or links" hasValue={task.notes.length > 0}>
          <textarea
            className="field"
            rows={4}
            value={task.notes}
            placeholder="Details, links, anything"
            onChange={(e) => updateTask(task.id, { notes: e.target.value.slice(0, 5000) })}
            autoFocus={task.notes.length === 0}
          />
        </OptionalField>
      </div>

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
