import { extractLinks } from '../lib/links'
import { REPEAT_LABEL } from '../model/repeat'
import { REPEATS, type Repeat, type Task } from '../model/types'
import { wouldCreateCycle } from '../plan/order'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'

export function RepeatField({ task }: { task: Task }) {
  const updateTask = useStore((s) => s.updateTask)
  const value = task.repeat ?? 'none'
  return (
    <label className="detail__inline">
      <Icon name="repeat" size={16} />
      <span className="visually-hidden">Repeats</span>
      <select
        className="field detail__select"
        value={value}
        aria-label="Repeats"
        onChange={(e) => updateTask(task.id, { repeat: e.target.value as Repeat })}
      >
        {REPEATS.map((r) => (
          <option key={r} value={r}>
            {REPEAT_LABEL[r]}
          </option>
        ))}
      </select>
    </label>
  )
}

/** "Do after": tasks that should be finished first. The planner keeps this one behind them. */
export function AfterField({ task, onEmpty }: { task: Task; onEmpty?: () => void }) {
  const tasks = useStore((s) => s.tasks)
  const updateTask = useStore((s) => s.updateTask)
  const after = (task.after ?? []).map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => t !== undefined)
  const candidates = tasks.filter(
    (t) => !t.done && t.id !== task.id && !(task.after ?? []).includes(t.id) && !wouldCreateCycle(tasks, task.id, t.id),
  )
  const set = (ids: string[]): void => {
    updateTask(task.id, { after: ids.length ? ids : undefined })
    if (!ids.length) onEmpty?.()
  }

  return (
    <div className="detail__group detail__after-wrap">
      <span className="detail__label">
        <Icon name="link" size={14} /> Start after
      </span>
      {after.length > 0 && (
        <ul className="detail__after">
          {after.map((t) => (
            <li key={t.id} className={t.done ? 'is-done' : undefined}>
              <Icon name={t.done ? 'check' : 'clock'} size={14} />
              <span>{t.title}</span>
              <button
                type="button"
                className="icon-btn detail__after-remove"
                onClick={() => set((task.after ?? []).filter((id) => id !== t.id))}
                aria-label={`Remove "${t.title}" from do after`}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <select
          className="field detail__select detail__after-add"
          value=""
          onChange={(e) => e.target.value && set([...(task.after ?? []), e.target.value])}
          aria-label="Do this after another task"
        >
          <option value="">{after.length ? 'Add another task…' : 'Pick the task that comes first…'}</option>
          {candidates.slice(0, 80).map((t) => (
            <option key={t.id} value={t.id}>
              {t.title.slice(0, 70)}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/** Links found in the title or notes, as chips that open in a new tab. */
export function LinkChips({ task }: { task: Task }) {
  const links = extractLinks(`${task.title}\n${task.notes}`)
  if (links.length === 0) return null
  return (
    <div className="detail__links">
      {links.map((l) => (
        <a key={l.url} className="detail__chip detail__chip--link" href={l.url} target="_blank" rel="noopener noreferrer">
          <Icon name="link" size={14} /> {l.host}
        </a>
      ))}
    </div>
  )
}
