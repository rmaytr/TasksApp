import { useEffect, useState } from 'react'
import { formatDue } from '../lib/dates'
import type { Task } from '../model/types'
import type { HeadsUp } from '../reminders/reminders'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import './HeadsUpStrip.css'

const MAX_ITEMS = 4

function permission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** The current permission, updated after our own request and when it changes in site settings. */
function useNotificationPermission(): [NotificationPermission | 'unsupported', () => void] {
  const [perm, setPerm] = useState(permission)
  useEffect(() => {
    let status: PermissionStatus | null = null
    const update = (): void => setPerm(permission())
    void navigator.permissions
      ?.query({ name: 'notifications' })
      .then((s) => {
        status = s
        s.addEventListener('change', update)
      })
      .catch(() => {})
    return () => status?.removeEventListener('change', update)
  }, [])
  const request = (): void => {
    void Notification.requestPermission().then(setPerm)
  }
  return [perm, request]
}

/** Gentle deadline nudges at the top of Today. No red, no counters: just what's close. */
export function HeadsUpStrip({ heads, now }: { heads: HeadsUp; now: Date }) {
  const select = useStore((s) => s.select)
  const remindersOn = useStore((s) => s.prefs.reminders.enabled)
  const [perm, requestPermission] = useNotificationPermission()
  const items: { task: Task; label: string }[] = [
    ...heads.overdue.map((task) => ({ task, label: 'Still open' })),
    ...heads.today.map((task) => ({ task, label: 'Today' })),
    ...heads.tomorrow.map((task) => ({ task, label: 'Tomorrow' })),
  ]
  if (items.length === 0) return null
  const extra = items.length - MAX_ITEMS

  return (
    <section className="heads" aria-labelledby="heads-h">
      <div className="heads__icon" aria-hidden="true">
        <Icon name="bell" size={18} />
      </div>
      <div className="heads__body">
        <h2 id="heads-h" className="heads__title">
          Coming up
        </h2>
        <ul className="heads__list">
          {items.slice(0, MAX_ITEMS).map(({ task, label }) => (
            <li key={task.id}>
              <button type="button" className="heads__item" onClick={() => select(task.id)}>
                <span className="heads__when">{label}</span>
                <span className="heads__name">{task.title}</span>
                {task.due && label === 'Still open' && <span className="heads__due num">was due {formatDue(task.due, now)}</span>}
              </button>
            </li>
          ))}
        </ul>
        {extra > 0 && <p className="heads__more num">and {extra} more</p>}
      </div>
      {remindersOn && perm === 'default' && (
        <button type="button" className="btn btn--sm heads__enable" onClick={requestPermission}>
          Remind me
        </button>
      )}
    </section>
  )
}
