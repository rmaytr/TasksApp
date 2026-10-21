import { AnimatePresence } from 'motion/react'
import { useMemo } from 'react'
import { useNow } from '../hooks'
import { compareUrgency, effectiveHorizon } from '../model/derive'
import { useStore } from '../store/useStore'
import { TaskRow } from './TaskRow'
import './NearList.css'

/** Phone companion to the radar: the tasks in the two inner rings, as a tappable list. */
export function NearList() {
  const tasks = useStore((s) => s.tasks)
  const hidden = useStore((s) => s.prefs.hiddenAreas)
  const setView = useStore((s) => s.setView)
  const now = useNow()
  const near = useMemo(
    () =>
      tasks
        .filter((t) => !t.done && !hidden.includes(t.areaId))
        .filter((t) => {
          const h = effectiveHorizon(t, now)
          return h === 'today' || h === 'week'
        })
        .sort((a, b) => compareUrgency(a, b, now)),
    [tasks, hidden, now],
  )
  return (
    <section className="near" aria-labelledby="near-title">
      <h2 id="near-title" className="near__title">
        Today and this week <span className="num">{near.length}</span>
      </h2>
      {near.length === 0 ? (
        <p className="near__empty">
          Nothing close. Pull a task inward on the radar, or{' '}
          <button type="button" className="near__link" onClick={() => setView('reset')}>
            do a quick reset
          </button>
          .
        </p>
      ) : (
        <ul className="trows">
          <AnimatePresence initial={false}>
            {near.map((t) => (
              <TaskRow key={t.id} task={t} now={now} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}
