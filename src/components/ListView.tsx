import { AnimatePresence } from 'motion/react'
import { useMemo } from 'react'
import { areaStyle, useNow } from '../hooks'
import { MAX_AREAS } from '../model/defaults'
import { effectiveHorizon } from '../model/derive'
import { HORIZONS, HORIZON_LABEL, priorityOf, type Area, type Horizon, type Priority, type Task } from '../model/types'
import { orderTasks } from '../plan/order'
import { useStore } from '../store/useStore'
import { AddRow } from './AddRow'
import { Icon } from './Icon'
import { TaskRow } from './TaskRow'
import './ListView.css'

export interface ListFilters {
  priority: Priority | 'all'
  waiting: boolean
  showDone: boolean
  query: string
}

interface Group {
  key: string
  title: string
  area?: Area
  horizon?: Horizon
  items: { task: Task; blockedBy?: string }[]
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

/**
 * Every task, grouped by area — or, on an area's page, by when. Order inside a group follows
 * the planning engine (deadlines, priority, and "do after" dependencies).
 */
export function ListView({ areaId, filters }: { areaId: string | null; filters: ListFilters }) {
  const areas = useStore((s) => s.areas)
  const tasks = useStore((s) => s.tasks)
  const hidden = useStore((s) => s.prefs.hiddenAreas)
  const setNewAreaOpen = useStore((s) => s.setNewAreaOpen)
  const now = useNow()

  const groups = useMemo((): Group[] => {
    const keep = (t: Task): boolean =>
      (areaId ? t.areaId === areaId : !hidden.includes(t.areaId)) &&
      matches(t, filters.query) &&
      (filters.priority === 'all' || priorityOf(t) === filters.priority) &&
      (!filters.waiting || Boolean(t.waiting))
    const ordered = orderTasks(tasks.filter(keep), now).map((p) => ({ task: p.task, blockedBy: p.blockedBy[0]?.title }))
    const done = filters.showDone ? tasks.filter((t) => t.done && keep(t)).map((task) => ({ task })) : []
    const all = [...ordered, ...done]
    if (areaId) {
      const rings: Group[] = HORIZONS.map((h) => ({
        key: h,
        title: HORIZON_LABEL[h],
        horizon: h,
        items: all.filter((i) => !i.task.done && effectiveHorizon(i.task, now) === h),
      }))
      const withDone: Group[] = done.length ? [...rings, { key: 'done', title: 'Done', items: done }] : rings
      return withDone.filter((g) => g.items.length > 0 || g.key === 'today')
    }
    return areas
      .filter((a) => !hidden.includes(a.id))
      .map((a) => ({ key: a.id, title: a.name, area: a, items: all.filter((i) => i.task.areaId === a.id) }))
  }, [tasks, areas, hidden, areaId, filters, now])

  const searching = filters.query.length > 0 || filters.priority !== 'all' || filters.waiting
  const total = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="list">
      {groups.map((group) =>
        searching && group.items.length === 0 ? null : (
          <section key={group.key} className="list__group" style={areaStyle(group.area)} aria-labelledby={`g-${group.key}`}>
            <h2 className="list__group-title" id={`g-${group.key}`}>
              {group.area && <span className="list__swatch" />}
              {group.title}
              <span className="list__count num">{group.items.length}</span>
            </h2>
            {group.items.length > 0 && (
              <ul className="trows">
                <AnimatePresence initial={false}>
                  {group.items.map(({ task, blockedBy }) => (
                    <TaskRow key={task.id} task={task} now={now} showWhen={!areaId} blockedBy={blockedBy} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
            {!searching && (group.area || group.key === 'today') && (
              <AddRow label={group.area ? `Add to ${group.title}` : 'Add a task'} areaId={group.area?.id ?? areaId} />
            )}
          </section>
        ),
      )}
      {!areaId && !searching && areas.length < MAX_AREAS && (
        <button type="button" className="list__new-area" onClick={() => setNewAreaOpen(true)}>
          <Icon name="plus" size={18} /> New area
        </button>
      )}
      <p className="list__empty" role="status">
        {searching && total === 0 ? 'Nothing matches these filters.' : ''}
      </p>
    </div>
  )
}
