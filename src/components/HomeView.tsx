import { AnimatePresence } from 'motion/react'
import { useMemo, useState } from 'react'
import { useAreaMap, useNow, areaStyle } from '../hooks'
import { todayISO } from '../lib/dates'
import { doneThisWeek, effectiveHorizon, nextStep } from '../model/derive'
import type { Task } from '../model/types'
import { orderTasks } from '../plan/order'
import { headsUp } from '../reminders/reminders'
import { useStore } from '../store/useStore'
import { Capture } from './Capture'
import { HeadsUpStrip } from './HeadsUpStrip'
import { Icon } from './Icon'
import { PlanButton } from './PlanButton'
import { PriorityMark, TaskRow } from './TaskRow'
import './HomeView.css'

const TODAY_VISIBLE = 5
const WEEK_MS = 7 * 86_400_000

function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 5) return 'Still up?'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Today: one place to drop a thought, one thing to do next, and a short list.
 * Everything else lives a click away in Tasks.
 */
export function HomeView() {
  const tasks = useStore((s) => s.tasks)
  const hidden = useStore((s) => s.prefs.hiddenAreas)
  const lastResetAt = useStore((s) => s.prefs.lastResetAt)
  const navigate = useStore((s) => s.navigate)
  const now = useNow()
  const [skipped, setSkipped] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)

  const visible = useMemo(() => tasks.filter((t) => !hidden.includes(t.areaId)), [tasks, hidden])
  const dayPlan = useStore((s) => s.prefs.dayPlan)
  // "Plan my day" (assistant) order wins for the day it was made; the local planner fills the rest.
  const plan = useMemo(() => {
    const local = orderTasks(visible, now)
    if (!dayPlan || dayPlan.date !== todayISO(now)) return local
    const rank = new Map(dayPlan.ids.map((id, i) => [id, i]))
    return [...local].sort((a, b) => (rank.get(a.task.id) ?? 1e6) - (rank.get(b.task.id) ?? 1e6))
  }, [visible, now, dayPlan])
  const next = plan.find((p) => p.blockedBy.length === 0 && !p.task.waiting && !skipped.includes(p.task.id))?.task
  const today = plan.filter((p) => p.task.id !== next?.id && effectiveHorizon(p.task, now) === 'today')
  const week = plan.filter((p) => p.task.id !== next?.id && effectiveHorizon(p.task, now) === 'week')
  const heads = useMemo(() => headsUp(visible, now), [visible, now])
  const done = doneThisWeek(tasks, now)
  const openCount = plan.length
  const resetDue = openCount >= 5 && (!lastResetAt || now.getTime() - lastResetAt > WEEK_MS)
  const shownToday = showAll ? today : today.slice(0, TODAY_VISIBLE)
  const blockerName = (ids: Task[]): string | undefined => ids[0]?.title

  return (
    <div className="home">
      <header className="home__head">
        <div>
          <p className="home__date">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="home__hello">{greeting(now)}</h1>
        </div>
        {done > 0 && (
          <div className="home__stats">
            <span className="home__stat">
              <strong className="num">{done}</strong> done this week
            </span>
          </div>
        )}
      </header>

      <Capture variant="hero" />

      <HeadsUpStrip heads={heads} now={now} />

      {next ? (
        <section className="home__section" aria-labelledby="next-h">
          <div className="home__section-head">
            <h2 id="next-h">Up next</h2>
            <PlanButton />
          </div>
          <UpNextCard task={next} onSkip={() => setSkipped((s) => [...s, next.id])} />
        </section>
      ) : (
        <EmptyHome hasTasks={openCount > 0} onReset={() => setSkipped([])} />
      )}

      {today.length > 0 && (
        <section className="home__section" aria-labelledby="today-h">
          <div className="home__section-head">
            <h2 id="today-h">
              Today <span className="num home__count">{today.length}</span>
            </h2>
          </div>
          <ul className="trows">
            <AnimatePresence initial={false}>
              {shownToday.map((p) => (
                <TaskRow key={p.task.id} task={p.task} now={now} showArea blockedBy={blockerName(p.blockedBy)} />
              ))}
            </AnimatePresence>
          </ul>
          {today.length > TODAY_VISIBLE && (
            <button type="button" className="btn btn--ghost btn--sm home__more" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show ${today.length - TODAY_VISIBLE} more`}
            </button>
          )}
        </section>
      )}

      {week.length > 0 && (
        <section className="home__section" aria-labelledby="week-h">
          <div className="home__section-head">
            <h2 id="week-h">
              This week <span className="num home__count">{week.length}</span>
            </h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate({ view: 'tasks', area: null, mode: 'list' })}>
              All tasks <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <ul className="trows">
            <AnimatePresence initial={false}>
              {week.slice(0, 4).map((p) => (
                <TaskRow key={p.task.id} task={p.task} now={now} showArea blockedBy={blockerName(p.blockedBy)} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}

      {resetDue && (
        <section className="home__reset card">
          <div>
            <h2>Fresh week?</h2>
            <p>A three-minute reset: go through each task once and decide what really matters this week.</p>
          </div>
          <button type="button" className="btn" onClick={() => navigate({ view: 'reset', area: null })}>
            <Icon name="reset" size={16} /> Start reset
          </button>
        </section>
      )}
    </div>
  )
}

function UpNextCard({ task, onSkip }: { task: Task; onSkip: () => void }) {
  const area = useAreaMap().get(task.areaId)
  const setDone = useStore((s) => s.setDone)
  const startFocus = useStore((s) => s.startFocus)
  const select = useStore((s) => s.select)
  const updateStep = useStore((s) => s.updateStep)
  const step = nextStep(task)
  const doneSteps = task.steps.filter((s) => s.done).length

  return (
    <article className="next card" style={areaStyle(area)}>
      <div className="next__top">
        <span className="next__area">
          <span className="dot" /> {area?.name}
        </span>
        <PriorityMark task={task} />
      </div>
      <button type="button" className="next__title" onClick={() => select(task.id)}>
        {task.title}
      </button>
      {step && (
        <label className="next__step">
          <input type="checkbox" className="check check--square" checked={false} onChange={() => updateStep(task.id, step.id, { done: true })} />
          <span>
            <span className="next__step-label num">
              Next step · {doneSteps + 1} of {task.steps.length}
            </span>
            {step.title}
          </span>
        </label>
      )}
      {task.plan && <p className="next__plan">You planned: {task.plan}</p>}
      <div className="next__actions">
        <button type="button" className="btn btn--primary" onClick={() => startFocus(task.id)}>
          <Icon name="play" size={16} /> Start
        </button>
        <button type="button" className="btn" onClick={() => setDone(task.id, true)}>
          <Icon name="check" size={16} /> Done
        </button>
        <button type="button" className="btn btn--ghost" onClick={onSkip}>
          Not now
        </button>
      </div>
    </article>
  )
}

function EmptyHome({ hasTasks, onReset }: { hasTasks: boolean; onReset: () => void }) {
  return (
    <section className="home__empty card">
      <h2>{hasTasks ? 'You skipped everything for now' : 'A clear head'}</h2>
      <p>
        {hasTasks
          ? 'That’s fine. Take a breath, or bring them back.'
          : 'Nothing on your list. Type whatever is on your mind above. Cairn sorts it for you.'}
      </p>
      {hasTasks && (
        <button type="button" className="btn" onClick={onReset}>
          Show tasks again
        </button>
      )}
    </section>
  )
}
