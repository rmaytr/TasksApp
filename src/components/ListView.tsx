import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type FormEvent } from 'react'
import { formatDue } from '../lib/dates'
import { areaStyle, useAreaMap, useNow, useReducedMotion } from '../hooks'
import { compareUrgency, effectiveHorizon, isStale } from '../model/derive'
import { MAX_AREAS } from '../model/defaults'
import { HORIZONS, HORIZON_LABEL, type Area, type Horizon, type Task } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { StepList } from './StepList'
import './ListView.css'

type Grouping = 'area' | 'ring'

interface Group {
  key: string
  title: string
  area?: Area
  horizon?: Horizon
  tasks: Task[]
}

function matches(task: Task, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    task.title.toLowerCase().includes(q) ||
    task.notes.toLowerCase().includes(q) ||
    task.steps.some((s) => s.title.toLowerCase().includes(q))
  )
}

export function ListView() {
  const [grouping, setGrouping] = useState<Grouping>('area')
  const [query, setQuery] = useState('')
  const [showDone, setShowDone] = useState(false)
  const areas = useStore((s) => s.areas)
  const tasks = useStore((s) => s.tasks)
  const hidden = useStore((s) => s.prefs.hiddenAreas)
  const setNewAreaOpen = useStore((s) => s.setNewAreaOpen)
  const now = useNow()

  const groups = useMemo((): Group[] => {
    const visible = tasks
      .filter((t) => (showDone || !t.done) && !hidden.includes(t.areaId) && matches(t, query))
      .sort((a, b) => Number(a.done) - Number(b.done) || compareUrgency(a, b, now))
    if (grouping === 'ring') {
      return HORIZONS.map((h) => ({
        key: h,
        title: HORIZON_LABEL[h],
        horizon: h,
        tasks: visible.filter((t) => effectiveHorizon(t, now) === h),
      }))
    }
    return areas
      .filter((a) => !hidden.includes(a.id))
      .map((a) => ({ key: a.id, title: a.name, area: a, tasks: visible.filter((t) => t.areaId === a.id) }))
  }, [tasks, areas, hidden, grouping, query, showDone, now])

  const total = groups.reduce((n, g) => n + g.tasks.length, 0)

  return (
    <div className="list">
      <div className="list__head">
        <h1 className="list__title">
          Everything <span className="list__total num">{total}</span>
        </h1>
        <div className="list__tools">
          <label className="list__search">
            <Icon name="search" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search tasks"
              type="search"
            />
          </label>
          <div className="seg" role="group" aria-label="Group by">
            {(['area', 'ring'] as const).map((g) => (
              <button key={g} type="button" aria-pressed={grouping === g} onClick={() => setGrouping(g)}>
                {g === 'area' ? 'By area' : 'By when'}
              </button>
            ))}
          </div>
          <label className="list__toggle">
            <input type="checkbox" className="check check--square" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show done
          </label>
        </div>
      </div>

      {groups.map((group) => (
        <GroupSection key={group.key} group={group} grouping={grouping} now={now} searching={query.length > 0} />
      ))}
      {grouping === 'area' && !query && areas.length < MAX_AREAS && (
        <button type="button" className="list__new-area" onClick={() => setNewAreaOpen(true)}>
          <Icon name="plus" size={18} /> New area
        </button>
      )}
      <p className="list__empty" role="status">
        {query && total === 0 ? `Nothing matches “${query}”.` : ''}
      </p>
    </div>
  )
}

interface GroupSectionProps {
  group: Group
  grouping: Grouping
  now: Date
  searching: boolean
}

function GroupSection({ group, grouping, now, searching }: GroupSectionProps) {
  const addTask = useStore((s) => s.addTask)
  const firstArea = useStore((s) => s.areas[0]?.id)
  const [draft, setDraft] = useState('')
  if (searching && group.tasks.length === 0) return null

  const add = (e: FormEvent): void => {
    e.preventDefault()
    const title = draft.trim()
    const areaId = group.area?.id ?? firstArea
    if (!title || !areaId) return
    addTask({ title, horizon: group.horizon }, areaId, 'week')
    setDraft('')
  }

  return (
    <section className="list__group" style={areaStyle(group.area)} aria-labelledby={`g-${group.key}`}>
      <h2 className="list__group-title" id={`g-${group.key}`}>
        {group.area && <span className="dot" />}
        {group.title}
        <span className="list__count num">{group.tasks.length}</span>
      </h2>
      <ul className="list__rows">
        <AnimatePresence initial={false}>
          {group.tasks.map((task) => (
            <Row key={task.id} task={task} now={now} showRing={grouping === 'area'} />
          ))}
        </AnimatePresence>
      </ul>
      {grouping === 'area' && (
        <form className="list__add" onSubmit={add}>
          <Icon name="plus" size={16} />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add to ${group.title}`} aria-label={`Add a task to ${group.title}`} maxLength={300} />
        </form>
      )}
    </section>
  )
}

export function Row({ task, now, showRing }: { task: Task; now: Date; showRing: boolean }) {
  const [open, setOpen] = useState(false)
  const setDone = useStore((s) => s.setDone)
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selectedId === task.id)
  const area = useAreaMap().get(task.areaId)
  const reduce = useReducedMotion()
  const doneSteps = task.steps.filter((s) => s.done).length
  const horizon = effectiveHorizon(task, now)

  return (
    <motion.li
      layout={!reduce}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className={`row${task.done ? ' is-done' : ''}${selected ? ' is-selected' : ''}${isStale(task, now) ? ' is-stale' : ''}`}
      style={areaStyle(area)}
    >
      <div className="row__main">
        <input
          type="checkbox"
          className="check"
          checked={task.done}
          onChange={(e) => setDone(task.id, e.target.checked)}
          aria-label={`Done: ${task.title}`}
        />
        <button type="button" className="row__title" onClick={() => select(task.id)}>
          {task.title}
        </button>
        <span className="row__meta">
          {task.high && <span className="tag tag--high">High</span>}
          {task.waiting && (
            <span className="tag" title={`Waiting on ${task.waiting}`}>
              Waiting<span className="visually-hidden"> on {task.waiting}</span>
            </span>
          )}
          {task.due && <span className="tag num">{formatDue(task.due, now)}</span>}
          {showRing && <span className="row__ring">{HORIZON_LABEL[horizon]}</span>}
          {task.steps.length > 0 && (
            <button
              type="button"
              className="row__steps num"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              aria-label={`${doneSteps}/${task.steps.length} steps done, ${open ? 'hide' : 'show'} steps`}
            >
              {doneSteps}/{task.steps.length}
              <span className={`row__chev${open ? ' is-open' : ''}`}>
                <Icon name="chevron" size={14} />
              </span>
            </button>
          )}
        </span>
      </div>
      {open && (
        <div className="row__steps-body">
          <StepList task={task} compact />
        </div>
      )}
    </motion.li>
  )
}
