import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { buildContext } from '../ai/context'
import { assistantError, getTransport } from '../assist/assistant'
import { areaStyle, useAreaMap, useNow, useReducedMotion } from '../hooks'
import { nextStep } from '../model/derive'
import type { Task } from '../model/types'
import { localPlan, mergeAssistantPlan, pinnedPlan, type LockInPlan } from '../plan/lockin'
import { useStore } from '../store/useStore'
import { DuePill } from './DueDate'
import { Icon } from './Icon'
import { Stones } from './Stones'
import './LockInView.css'

type Phase = { kind: 'start' } | { kind: 'planning' } | { kind: 'go'; plan: LockInPlan; index: number }

/**
 * Lock in: when everything feels like too much, Cairn picks one thing (with the assistant if
 * it's on, otherwise from deadlines and priorities) and shows only its next small step.
 * Every finished step adds a stone to the cairn.
 */
export function LockInView() {
  const tasks = useStore((s) => s.tasks)
  const focusTaskId = useStore((s) => s.focusTaskId)
  const ai = useStore((s) => s.prefs.ai)
  const showToast = useStore((s) => s.showToast)
  const navigate = useStore((s) => s.navigate)
  const now = useNow()
  const [phase, setPhase] = useState<Phase>(() =>
    focusTaskId ? { kind: 'go', plan: pinnedPlan(focusTaskId, useStore.getState().tasks, new Date()), index: 0 } : { kind: 'start' },
  )
  const [stones, setStones] = useState(0)
  const open = useMemo(() => tasks.filter((t) => !t.done), [tasks])

  // A task picked from elsewhere ("Lock in" in the task panel) jumps straight in, once.
  const [pinned, setPinned] = useState(focusTaskId)
  if (focusTaskId && focusTaskId !== pinned) {
    setPinned(focusTaskId)
    setPhase({ kind: 'go', plan: pinnedPlan(focusTaskId, tasks, now), index: 0 })
  }
  useEffect(() => {
    if (focusTaskId) useStore.setState({ focusTaskId: null })
  }, [focusTaskId])

  const start = async (): Promise<void> => {
    setPhase({ kind: 'planning' })
    const all = useStore.getState().tasks
    const transport = ai === 'off' ? null : await getTransport()
    if (!transport) {
      setPhase({ kind: 'go', plan: localPlan(all, new Date()), index: 0 })
      return
    }
    try {
      const result = await transport.plan(buildContext(all, useStore.getState().areas, new Date()))
      const latest = useStore.getState().tasks
      setPhase({ kind: 'go', plan: mergeAssistantPlan(result.order, result.summary, latest, new Date()), index: 0 })
    } catch (error) {
      showToast(`${assistantError(error)} Using your deadlines and priorities instead.`)
      setPhase({ kind: 'go', plan: localPlan(useStore.getState().tasks, new Date()), index: 0 })
    }
  }

  if (phase.kind === 'start') {
    return (
      <div className="lockin lockin--start">
        <Stones count={0} size={170} />
        <h1 className="lockin__headline">What should I do right now?</h1>
        <p className="lockin__lede">
          {open.length === 0
            ? 'Nothing is open. Add a task on Today first.'
            : 'Cairn looks at everything you have and gives you one small step. Just that one. The rest can wait.'}
        </p>
        {open.length > 0 && (
          <button type="button" className="btn btn--primary btn--lg lockin__go" onClick={() => void start()}>
            <Icon name="target" size={20} /> Lock in
          </button>
        )}
        {open.length > 0 && ai !== 'off' && (
          <p className="lockin__hint">
            <Icon name="sparkle" size={14} /> The assistant plans the order
          </p>
        )}
      </div>
    )
  }

  if (phase.kind === 'planning') {
    return (
      <div className="lockin lockin--start" role="status">
        <Stones count={0} />
        <h1 className="lockin__headline">Looking at everything…</h1>
        <p className="lockin__lede">Deadlines first, then what other tasks depend on, then priority.</p>
      </div>
    )
  }

  const { plan, index } = phase
  const queue = plan.ids
    .slice(index)
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined && !t.done)
  const current = queue[0]
  const advance = (): void => {
    const at = current ? plan.ids.indexOf(current.id, index) : index
    setPhase({ kind: 'go', plan, index: at + 1 })
  }

  if (!current) {
    return (
      <div className="lockin lockin--start">
        <Stones count={stones} size={170} />
        <h1 className="lockin__headline">{stones > 0 ? 'Done for this round' : 'That’s everything'}</h1>
        <p className="lockin__lede">
          {stones > 0
            ? `You finished ${stones} ${stones === 1 ? 'thing' : 'things'}. That counts.`
            : 'You went through the whole list.'}
        </p>
        <div className="lockin__row">
          <button type="button" className="btn btn--primary" onClick={() => navigate({ view: 'home', area: null })}>
            Back to Today
          </button>
          <button type="button" className="btn" onClick={() => setPhase({ kind: 'start' })}>
            Lock in again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="lockin">
      <div className="lockin__bar">
        <Stones count={stones} size={88} />
        <p className="lockin__count num" aria-live="polite">
          {stones === 0 ? 'Each thing you finish adds a stone' : `${stones} done`}
        </p>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate({ view: 'home', area: null })}>
          End
        </button>
      </div>
      <AnimatePresence mode="wait">
        <NowCard
          key={current.id}
          task={current}
          now={now}
          reason={plan.reasons[current.id] ?? null}
          summary={index === 0 ? plan.summary : null}
          fromAssistant={plan.source === 'assistant'}
          onFinished={() => setStones((n) => n + 1)}
          onTaskDone={advance}
          onSkip={advance}
        />
      </AnimatePresence>
      {queue[1] && (
        <p className="lockin__then">
          <span>Then</span> {queue[1].title}
        </p>
      )}
    </div>
  )
}

interface NowCardProps {
  task: Task
  now: Date
  reason: string | null
  summary: string | null
  fromAssistant: boolean
  onFinished: () => void
  onTaskDone: () => void
  onSkip: () => void
}

/** The one thing: the next step big, the task it belongs to small, and why it's first. */
function NowCard({ task, now, reason, summary, fromAssistant, onFinished, onTaskDone, onSkip }: NowCardProps) {
  const area = useAreaMap().get(task.areaId)
  const updateStep = useStore((s) => s.updateStep)
  const addStep = useStore((s) => s.addStep)
  const setDone = useStore((s) => s.setDone)
  const ai = useStore((s) => s.prefs.ai)
  const reduce = useReducedMotion()
  const [breaking, setBreaking] = useState(false)
  const [ownStep, setOwnStep] = useState<string | null>(null)
  const step = nextStep(task)
  const doneSteps = task.steps.filter((s) => s.done).length

  useEffect(() => {
    document.querySelector<HTMLElement>('.now__done')?.focus({ preventScroll: true })
  }, [step?.id])

  const finish = (): void => {
    onFinished()
    if (step && task.steps.some((s) => !s.done && s.id !== step.id)) {
      updateStep(task.id, step.id, { done: true })
      return
    }
    if (step) updateStep(task.id, step.id, { done: true })
    setDone(task.id, true)
    onTaskDone()
  }

  const breakDown = async (): Promise<void> => {
    const transport = ai === 'off' ? null : await getTransport()
    if (!transport) {
      setOwnStep('')
      return
    }
    setBreaking(true)
    try {
      const { tasks, areas } = useStore.getState()
      const result = await transport.analyze(
        `Break this into small first steps: ${task.title}`,
        buildContext(tasks.filter((t) => t.id !== task.id), areas, new Date()),
      )
      const steps = result.tasks[0]?.steps ?? []
      if (steps.length === 0) setOwnStep('')
      for (const title of steps) addStep(task.id, title)
    } catch (error) {
      useStore.getState().showToast(assistantError(error))
      setOwnStep('')
    } finally {
      setBreaking(false)
    }
  }

  return (
    <motion.article
      className="now"
      style={areaStyle(area)}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -12 }}
      transition={{ duration: 0.22 }}
      aria-labelledby="now-step"
    >
      {summary && <p className="now__summary">{summary}</p>}
      <p className="now__task">
        <span className="dot" />
        <span className="now__task-title">{step ? task.title : area?.name}</span>
        {task.due && <DuePill due={task.due} now={now} />}
      </p>
      <h1 id="now-step" className="now__step" tabIndex={-1}>
        {step ? step.title : task.title}
      </h1>
      {step && task.steps.length > 1 && (
        <p className="now__progress num" aria-label={`Step ${doneSteps + 1} of ${task.steps.length}`}>
          {task.steps.map((s) => (
            <i key={s.id} className={s.done ? 'is-done' : s.id === step.id ? 'is-now' : undefined} />
          ))}
        </p>
      )}
      {reason && (
        <p className="now__why">
          {fromAssistant && <Icon name="sparkle" size={14} />}
          {reason}
        </p>
      )}

      {ownStep !== null && (
        <form
          className="now__own"
          onSubmit={(e) => {
            e.preventDefault()
            if (ownStep.trim()) addStep(task.id, ownStep.trim())
            setOwnStep(null)
          }}
        >
          <input
            className="field"
            autoFocus
            value={ownStep}
            onChange={(e) => setOwnStep(e.target.value)}
            placeholder="What’s the smallest first step?"
            aria-label="First step"
            maxLength={300}
          />
          <button type="submit" className="btn" disabled={!ownStep.trim()}>
            Add
          </button>
        </form>
      )}

      <div className="now__actions">
        <button type="button" className="btn btn--primary btn--lg now__done" onClick={finish}>
          <Icon name="check" size={20} /> Done
        </button>
        {!step && ownStep === null && (
          <button type="button" className="btn btn--lg" onClick={() => void breakDown()} disabled={breaking}>
            <Icon name="sparkle" size={18} /> {breaking ? 'Breaking it down…' : 'Make it smaller'}
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--lg" onClick={onSkip}>
          <Icon name="skip" size={18} /> Not now
        </button>
      </div>
    </motion.article>
  )
}
