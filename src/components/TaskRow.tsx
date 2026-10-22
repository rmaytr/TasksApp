import { animate, motion, useMotionValue, type PanInfo } from 'motion/react'
import { useRef, useState, type MouseEvent } from 'react'
import { TASK_DRAG_TYPE } from '../lib/drag'
import { extractLinks } from '../lib/links'
import { areaStyle, useAreaMap, useMediaQuery, useReducedMotion } from '../hooks'
import { isStale } from '../model/derive'
import { priorityOf, type Task } from '../model/types'
import { useStore } from '../store/useStore'
import { DuePill } from './DueDate'
import { Icon } from './Icon'
import { StepList } from './StepList'
import { TaskMenu, TaskMenuButton } from './TaskMenu'
import { useMenu } from './useMenu'
import './TaskRow.css'

interface TaskRowProps {
  task: Task
  now: Date
  /** Name of an open task this one waits for. */
  blockedBy?: string
}

/** A flag for high priority; normal and low stay unmarked to keep rows quiet. */
export function PriorityMark({ task }: { task: Pick<Task, 'high' | 'low'> }) {
  if (priorityOf(task) !== 'high') return null
  return (
    <span className="trow__flag" title="High priority">
      <Icon name="flag" size={15} />
      <span className="visually-hidden">High priority</span>
    </span>
  )
}

/** One task in a list: check it off, open it, peek at its steps. Calm by default. */
export function TaskRow({ task, now, blockedBy }: TaskRowProps) {
  const [open, setOpen] = useState(false)
  const setDone = useStore((s) => s.setDone)
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selectedId === task.id)
  const sorting = useStore((s) => s.assistBusy.includes(task.id))
  const area = useAreaMap().get(task.areaId)
  const reduce = useReducedMotion()
  const doneSteps = task.steps.filter((s) => s.done).length
  const link = extractLinks(`${task.title}\n${task.notes}`)[0]
  const menu = useMenu()
  const dotsRef = useRef<HTMLButtonElement>(null)
  const { enabled: swipeable, x: swipeX, ref: swipeRef, armed, onPointerDownCapture, onDragStart, onDrag, onDragEnd, onClickCapture } = useSwipe(task)

  return (
    <motion.li
      layout={!reduce}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0, x: reduce ? 0 : 24, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } }}
      transition={{ duration: 0.18 }}
      className={`trow${task.done ? ' is-done' : ''}${selected ? ' is-selected' : ''}${isStale(task, now) ? ' is-stale' : ''}${menu.anchor ? ' has-menu' : ''}`}
      style={areaStyle(area)}
    >
      <div className={`trow__track${armed ? ` is-armed-${armed}` : ''}`}>
      {swipeable && (
        <div className="trow__swipe" aria-hidden="true">
          <span className="trow__swipe-done">
            <Icon name="check" size={18} /> Done
          </span>
          <span className="trow__swipe-snooze">
            Snooze <Icon name="clock" size={18} />
          </span>
        </div>
      )}
      <motion.div
        ref={swipeRef}
        className="trow__slide"
        style={{ x: swipeX }}
        drag={swipeable ? 'x' : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        dragMomentum={false}
        onPointerDownCapture={onPointerDownCapture}
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        onClickCapture={onClickCapture}
      >
      <div
        className="trow__main"
        // Drag a row onto an area (or Today) in the sidebar to move it there (mouse only; touch swipes).
        draggable={!task.done && !swipeable}
        onDragStart={(e) => {
          e.dataTransfer.setData(TASK_DRAG_TYPE, task.id)
          e.dataTransfer.setData('text/plain', task.title)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          // The keyboard menu key reports (0, 0): open beside the ⋯ instead.
          menu.openAt(e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : { el: dotsRef.current })
        }}
      >
        <input
          type="checkbox"
          className="check"
          checked={task.done}
          onChange={(e) => setDone(task.id, e.target.checked)}
          aria-label={`Done: ${task.title}`}
        />
        <button type="button" className="trow__body" data-task-id={task.id} onClick={() => select(task.id)}>
          <span className="trow__title">{task.title}</span>
          {(sorting || blockedBy || task.waiting) && (
            <span className="trow__meta">
              {sorting && (
                <span className="trow__sorting" role="status">
                  <Icon name="sparkle" size={12} /> Sorting…
                </span>
              )}
              {blockedBy && (
                <span className="trow__blocked" title={`Starts after “${blockedBy}”`}>
                  <Icon name="link" size={12} /> after {blockedBy}
                </span>
              )}
              {task.waiting && (
                <span className="trow__waiting" title={`Waiting on ${task.waiting}`}>
                  <Icon name="hourglass" size={12} /> {task.waiting}
                </span>
              )}
            </span>
          )}
        </button>
        <span className="trow__side">
          <PriorityMark task={task} />
          {task.due && <DuePill due={task.due} now={now} />}
          {link && (
            <a className="trow__link" href={link.url} target="_blank" rel="noopener noreferrer" title={link.url}>
              <Icon name="link" size={14} />
              <span className="visually-hidden">Open {link.host}</span>
            </a>
          )}
          {task.steps.length > 0 && (
            <button
              type="button"
              className="trow__steps num"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              aria-label={`${doneSteps}/${task.steps.length} steps done, ${open ? 'hide' : 'show'} steps`}
            >
              {doneSteps}/{task.steps.length}
              <span className={`trow__chev${open ? ' is-open' : ''}`}>
                <Icon name="chevron" size={13} />
              </span>
            </button>
          )}
          <TaskMenuButton
            title={task.title}
            open={Boolean(menu.anchor)}
            buttonRef={dotsRef}
            onToggle={() => (menu.anchor ? menu.close() : menu.openAt({ el: dotsRef.current }))}
          />
        </span>
      </div>
      </motion.div>
      </div>
      <TaskMenu task={task} anchor={menu.anchor} onClose={menu.close} />
      {open && (
        <div className="trow__steps-body">
          <StepList task={task} compact />
        </div>
      )}
    </motion.li>
  )
}

type Armed = 'done' | 'snooze' | null

/**
 * Touch swipes on a row: right to finish, left to snooze. Past the threshold the action is
 * "armed" (the backdrop pops and the phone ticks); letting go there runs it, anywhere else
 * springs the row back. Mouse users keep drag-to-area and the ⋯ menu instead.
 */
function useSwipe(task: Task) {
  const touch = useMediaQuery('(pointer: coarse)')
  const reduce = useReducedMotion()
  const setDone = useStore((s) => s.setDone)
  const snoozeTask = useStore((s) => s.snoozeTask)
  const x = useMotionValue(0)
  const ref = useRef<HTMLDivElement>(null)
  const [armed, setArmed] = useState<Armed>(null)
  // A swipe that ends where it started must not also count as a tap that opens the task.
  const swiped = useRef(false)
  const enabled = touch && !task.done

  const threshold = (): number => Math.min(110, (ref.current?.offsetWidth ?? 320) * 0.32)

  const onDrag = (_: unknown, info: PanInfo): void => {
    const next: Armed = info.offset.x > threshold() ? 'done' : info.offset.x < -threshold() ? 'snooze' : null
    if (next === armed) return
    if (next) navigator.vibrate?.(8)
    setArmed(next)
  }

  const onDragEnd = (_: unknown, info: PanInfo): void => {
    const width = ref.current?.offsetWidth ?? 320
    const action = armed
    setArmed(null)
    const fast = { duration: reduce ? 0 : 0.16, ease: 'easeOut' as const }
    if (action === 'done') {
      void animate(x, width, fast).then(() => setDone(task.id, true))
    } else if (action === 'snooze') {
      void animate(x, -width, fast).then(() => {
        snoozeTask(task.id)
        // If the row stays in this list, slide it back in from the far side.
        x.set(width * 0.35)
        void animate(x, 0, { type: 'spring', stiffness: 420, damping: 36, duration: reduce ? 0 : undefined })
      })
    } else {
      void animate(x, 0, { type: 'spring', stiffness: 520, damping: 34, velocity: info.velocity.x })
    }
  }

  // Each new touch starts clean (touch screens often send no click after a swipe).
  const onPointerDownCapture = (): void => {
    swiped.current = false
  }

  const onDragStart = (): void => {
    swiped.current = true
  }

  const onClickCapture = (e: MouseEvent): void => {
    if (!swiped.current) return
    swiped.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  return { enabled, x, ref, armed, onPointerDownCapture, onDragStart, onDrag, onDragEnd, onClickCapture }
}
