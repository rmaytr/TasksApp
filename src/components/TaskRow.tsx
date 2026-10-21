import { motion } from 'motion/react'
import { useState } from 'react'
import { daysBetween, formatDue, todayISO } from '../lib/dates'
import { extractLinks } from '../lib/links'
import { areaStyle, useAreaMap, useReducedMotion } from '../hooks'
import { effectiveHorizon, isStale } from '../model/derive'
import { HORIZON_LABEL, priorityOf, type Task } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { StepList } from './StepList'
import './TaskRow.css'

interface TaskRowProps {
  task: Task
  now: Date
  /** Show the ring ("This week") when the list isn't already grouped by it. */
  showWhen?: boolean
  /** Show the area name (lists that mix areas). */
  showArea?: boolean
  /** Name of an open task this one waits for. */
  blockedBy?: string
}

export function PriorityMark({ task }: { task: Pick<Task, 'high' | 'low'> }) {
  const level = priorityOf(task)
  return (
    <span className="prio" data-level={level} title={`${level[0].toUpperCase()}${level.slice(1)} priority`}>
      <i />
      <i />
      <i />
      <span className="visually-hidden">{level} priority</span>
    </span>
  )
}

/** One task in a list: check it off, open it, peek at its steps. Calm by default. */
export function TaskRow({ task, now, showWhen = false, showArea = false, blockedBy }: TaskRowProps) {
  const [open, setOpen] = useState(false)
  const setDone = useStore((s) => s.setDone)
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selectedId === task.id)
  const sorting = useStore((s) => s.assistBusy.includes(task.id))
  const area = useAreaMap().get(task.areaId)
  const reduce = useReducedMotion()
  const doneSteps = task.steps.filter((s) => s.done).length
  const link = extractLinks(`${task.title}\n${task.notes}`)[0]
  const soon = task.due ? daysBetween(todayISO(now), task.due) <= 1 : false
  const priority = priorityOf(task)

  return (
    <motion.li
      layout={!reduce}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className={`trow${task.done ? ' is-done' : ''}${selected ? ' is-selected' : ''}${isStale(task, now) ? ' is-stale' : ''}`}
      style={areaStyle(area)}
    >
      <div className="trow__main">
        <input
          type="checkbox"
          className="check"
          checked={task.done}
          onChange={(e) => setDone(task.id, e.target.checked)}
          aria-label={`Done: ${task.title}`}
        />
        <button type="button" className="trow__body" data-task-id={task.id} onClick={() => select(task.id)}>
          <span className="trow__title">{task.title}</span>
          <span className="trow__meta">
            {showArea && area && (
              <span className="trow__area">
                <span className="dot" /> {area.name}
              </span>
            )}
            {sorting && (
              <span className="trow__sorting" role="status">
                <Icon name="sparkle" size={12} /> Sorting…
              </span>
            )}
            {blockedBy && (
              <span className="trow__blocked">
                <Icon name="clock" size={12} /> After “{blockedBy}”
              </span>
            )}
            {task.waiting && <span className="trow__waiting">Waiting on {task.waiting}</span>}
            {showWhen && !task.due && <span>{HORIZON_LABEL[effectiveHorizon(task, now)]}</span>}
          </span>
        </button>
        <span className="trow__side">
          {priority !== 'normal' && <PriorityMark task={task} />}
          {task.due && <span className={`tag num${soon ? ' tag--soon' : ''}`}>{formatDue(task.due, now)}</span>}
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
        </span>
      </div>
      {open && (
        <div className="trow__steps-body">
          <StepList task={task} compact />
        </div>
      )}
    </motion.li>
  )
}
