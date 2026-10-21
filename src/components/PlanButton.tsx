import { useEffect, useState } from 'react'
import { buildContext } from '../ai/context'
import type { AiPlanResult } from '../ai/types'
import { assistantError, getTransport } from '../assist/assistant'
import { useNow } from '../hooks'
import { todayISO } from '../lib/dates'
import { useStore } from '../store/useStore'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import './PlanButton.css'

/** "Plan my day": the assistant proposes an order and the links between tasks; you accept or skip. */
export function PlanButton() {
  const ai = useStore((s) => s.prefs.ai)
  const hasTasks = useStore((s) => s.tasks.some((t) => !t.done))
  const [open, setOpen] = useState(false)
  if (ai === 'off' || !hasTasks) return null
  return (
    <>
      <button type="button" className="btn btn--sm" onClick={() => setOpen(true)}>
        <Icon name="sparkle" size={15} /> Plan my day
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Plan my day" wide>
        {open && <PlanBody onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  )
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; plan: AiPlanResult }

function PlanBody({ onDone }: { onDone: () => void }) {
  const tasks = useStore((s) => s.tasks)
  const setPrefs = useStore((s) => s.setPrefs)
  const addDependencies = useStore((s) => s.addDependencies)
  const now = useNow()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [skip, setSkip] = useState<Set<string>>(new Set())
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      const transport = await getTransport()
      if (!transport) {
        setState({ kind: 'error', message: 'The assistant isn’t set up yet. Add a key or invite code in Settings.' })
        return
      }
      try {
        const { tasks: all, areas } = useStore.getState()
        const plan = await transport.plan(buildContext(all, areas, new Date()), controller.signal)
        setState({ kind: 'ready', plan })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ kind: 'error', message: assistantError(error) })
      }
    })()
    return () => controller.abort()
  }, [])

  const title = (id: string): string => tasks.find((t) => t.id === id)?.title ?? 'a task'

  if (state.kind === 'loading') {
    return (
      <div className="dialog__body plan plan--loading" role="status">
        <span className="plan__spinner" aria-hidden="true" />
        <p>Looking at your deadlines, priorities and what depends on what…</p>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="dialog__body plan">
        <p role="alert">{state.message}</p>
      </div>
    )
  }

  const { plan } = state
  const edges = plan.dependencies.flatMap((d) => d.after.map((after) => ({ key: `${d.taskId}>${after}`, taskId: d.taskId, after })))
  function apply(): void {
    setPrefs({ dayPlan: { date: todayISO(now), ids: plan.order.map((o) => o.taskId), summary: plan.summary } })
    const chosen = edges.filter((e) => !skip.has(e.key))
    if (chosen.length) addDependencies(chosen.map((e) => ({ taskId: e.taskId, after: [e.after] })))
    onDone()
  }

  return (
    <>
      <div className="dialog__body plan">
        {plan.summary && <p className="plan__summary">{plan.summary}</p>}
        <ol className="plan__order">
          {plan.order.slice(0, 12).map((o, i) => (
            <li key={o.taskId}>
              <span className="plan__n num">{i + 1}</span>
              <span>
                <strong>{title(o.taskId)}</strong>
                {o.reason && <span className="plan__reason">{o.reason}</span>}
              </span>
            </li>
          ))}
        </ol>
        {edges.length > 0 && (
          <fieldset className="plan__edges">
            <legend>Suggested order between tasks</legend>
            {edges.map((e) => (
              <label key={e.key} className="plan__edge">
                <input
                  type="checkbox"
                  className="check check--square"
                  checked={!skip.has(e.key)}
                  onChange={(ev) => {
                    const next = new Set(skip)
                    if (ev.target.checked) next.delete(e.key)
                    else next.add(e.key)
                    setSkip(next)
                  }}
                />
                <span>
                  Do <strong>{title(e.taskId)}</strong> after <strong>{title(e.after)}</strong>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
      <footer className="dialog__foot">
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          Not now
        </button>
        <button type="button" className="btn btn--primary" onClick={apply}>
          Use this plan
        </button>
      </footer>
    </>
  )
}
