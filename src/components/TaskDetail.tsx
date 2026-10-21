import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { areaStyle, useAreaMap, useMediaQuery, useNow } from '../hooks'
import { formatDue } from '../lib/dates'
import { REPEAT_LABEL } from '../model/repeat'
import { HORIZON_LABEL, PRIORITY_LABEL, priorityOf, type Priority, type Task } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { AfterField, LinkChips, RepeatField } from './DetailFields'
import { DatePicker } from './DueDate'
import { StepList } from './StepList'
import './TaskDetail.css'

const PRIORITIES: readonly Priority[] = ['high', 'normal', 'low']

/** Which inline editor is open under the chip row. */
type Editor = 'date' | 'priority' | 'repeat' | null

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

/**
 * Title, one row of chips (date, priority), steps and a note. Repeat, "waiting on" and
 * "after another task" stay out of sight until the task uses them or the user adds one.
 */
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
  const [editor, setEditor] = useState<Editor>(null)
  const [showWaiting, setShowWaiting] = useState(false)
  const [showAfter, setShowAfter] = useState(false)
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

  const commitTitle = (): void => {
    const clean = title.trim()
    if (clean && clean !== task.title) updateTask(task.id, { title: clean.slice(0, 300) })
    else setTitle(task.title)
  }
  const toggle = (next: Editor): void => setEditor(editor === next ? null : next)
  const priority = priorityOf(task)
  const repeats = Boolean(task.repeat && task.repeat !== 'none')
  const waiting = showWaiting || task.waiting !== null
  const after = showAfter || (task.after?.length ?? 0) > 0

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
        rows={1}
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

      <div className="detail__chips" role="group" aria-label="Date and priority">
        <button
          type="button"
          className={`dchip${task.due ? ' dchip--set' : ''}`}
          aria-expanded={editor === 'date'}
          aria-label={task.due ? `Due ${formatDue(task.due, now)}. Change date` : 'Add a date'}
          onClick={() => toggle('date')}
        >
          <Icon name="calendar" size={16} />
          {task.due ? formatDue(task.due, now) : <span className="dchip__muted">{HORIZON_LABEL[task.horizon]}</span>}
        </button>
        <button
          type="button"
          className={`dchip dchip--prio-${priority}`}
          aria-expanded={editor === 'priority'}
          aria-label={`Priority: ${PRIORITY_LABEL[priority]}`}
          onClick={() => toggle('priority')}
        >
          <Icon name="flag" size={16} />
          {priority === 'normal' ? <span className="dchip__muted">Priority</span> : PRIORITY_LABEL[priority]}
        </button>
        {repeats && (
          <button type="button" className="dchip dchip--set" aria-expanded={editor === 'repeat'} onClick={() => toggle('repeat')}>
            <Icon name="repeat" size={16} />
            {REPEAT_LABEL[task.repeat ?? 'none']}
          </button>
        )}
      </div>

      {editor === 'date' && (
        <DatePicker
          due={task.due}
          horizon={task.horizon}
          now={now}
          onPick={(due) => {
            updateTask(task.id, { due })
            setEditor(null)
          }}
          onNoDate={(horizon) => {
            updateTask(task.id, { due: null, horizon })
            setEditor(null)
          }}
        />
      )}
      {editor === 'priority' && (
        <div className="detail__prio" role="group" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={`detail__prio-opt detail__prio-opt--${p}`}
              aria-pressed={priority === p}
              onClick={() => {
                updateTask(task.id, { high: p === 'high', low: p === 'low' })
                setEditor(null)
              }}
            >
              <Icon name="flag" size={16} /> {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      )}
      {editor === 'repeat' && <RepeatField task={task} />}

      <StepList task={task} />

      <textarea
        className="detail__note"
        rows={2}
        value={task.notes}
        placeholder="Add a note"
        aria-label="Note"
        onChange={(e) => updateTask(task.id, { notes: e.target.value.slice(0, 5000) })}
      />

      {waiting && (
        <div className="detail__extra">
          <Icon name="hourglass" size={16} />
          <input
            className="detail__extra-input"
            value={task.waiting ?? ''}
            placeholder="Waiting on… (e.g. a reply from Dr. Lee)"
            aria-label="Waiting on"
            autoFocus={showWaiting && task.waiting === null}
            onChange={(e) => updateTask(task.id, { waiting: e.target.value || null })}
            maxLength={200}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Not waiting on anything"
            onClick={() => {
              updateTask(task.id, { waiting: null })
              setShowWaiting(false)
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {after && <AfterField task={task} onEmpty={() => setShowAfter(false)} />}

      {!(repeats && waiting && after) && (
        <div className="detail__add" role="group" aria-label="Add">
          {!repeats && editor !== 'repeat' && (
            <button type="button" className="detail__add-btn" onClick={() => setEditor('repeat')}>
              <Icon name="repeat" size={15} /> Repeat
            </button>
          )}
          {!waiting && (
            <button type="button" className="detail__add-btn" onClick={() => setShowWaiting(true)}>
              <Icon name="hourglass" size={15} /> Waiting on someone
            </button>
          )}
          {!after && (
            <button type="button" className="detail__add-btn" onClick={() => setShowAfter(true)}>
              <Icon name="link" size={15} /> After another task
            </button>
          )}
        </div>
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
          <Icon name="check" size={18} /> {task.done ? 'Not done' : 'Done'}
        </button>
        {!task.done && (
          <button type="button" className="btn" onClick={() => startFocus(task.id)}>
            <Icon name="target" size={18} /> Lock in
          </button>
        )}
        <span className="detail__spacer" />
        <button
          type="button"
          className="icon-btn detail__delete"
          onClick={() => deleteTask(task.id)}
          aria-label="Delete task"
          title="Delete task"
        >
          <Icon name="trash" size={19} />
        </button>
      </div>
    </div>
  )
}
