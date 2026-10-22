import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { TASK_DRAG_TYPE } from '../lib/drag'
import { extractLinks } from '../lib/links'
import { areaStyle, useAreaMap, useReducedMotion } from '../hooks'
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
      <div
        className="trow__main"
        // Drag a row onto an area (or Today) in the sidebar to move it there.
        draggable={!task.done}
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
      <TaskMenu task={task} anchor={menu.anchor} onClose={menu.close} />
      {open && (
        <div className="trow__steps-body">
          <StepList task={task} compact />
        </div>
      )}
    </motion.li>
  )
}
