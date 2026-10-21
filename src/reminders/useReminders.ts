import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { dueReminders, pruneFired, reminderKeys, type Reminder } from './reminders'

const CHECK_MS = 60_000

/** Shows a system notification if allowed. Android Chrome only allows them via the service worker. */
async function notify(reminder: Reminder, onClick: () => void): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const options: NotificationOptions = { body: reminder.body, tag: reminder.key, icon: `${import.meta.env.BASE_URL}icon-192.png` }
  try {
    const n = new Notification(reminder.title, options)
    n.onclick = () => {
      window.focus()
      onClick()
      n.close()
    }
  } catch {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.showNotification(reminder.title, options)
  }
}

/**
 * Checks once a minute (and whenever the app comes back into view) for deadline reminders:
 * the evening before, the morning of, and once when something is overdue. Each fires once.
 */
export function useReminders(): void {
  useEffect(() => {
    const check = (): void => {
      const s = useStore.getState()
      if (!s.hydrated || !s.prefs.reminders.enabled) return
      const visible = document.visibilityState === 'visible'
      const canNotify = typeof Notification !== 'undefined' && Notification.permission === 'granted'
      // Nowhere to show it yet: leave it unfired so the next visible check delivers it.
      if (!visible && !canNotify) return
      const now = new Date()
      const fired = new Set(s.prefs.firedReminders)
      const due = dueReminders(s.tasks, now, s.prefs.reminders, fired)
      if (due.length === 0) return
      const keys = due.flatMap((r) => [r.key, ...reminderKeys(r, s.tasks)])
      s.setPrefs({ firedReminders: pruneFired([...s.prefs.firedReminders, ...keys], s.tasks, now) })
      for (const r of due) {
        const open = (): void => {
          const first = r.taskIds[0]
          if (r.taskIds.length === 1 && first) useStore.getState().select(first)
          else useStore.getState().navigate({ view: 'home', area: null })
        }
        void notify(r, open)
      }
      // One quiet toast, and never over an Undo or an error the user still needs.
      const current = useStore.getState().toast
      if (visible && !current?.undoable && !current?.sticky) {
        const [first] = due
        if (first) s.showToast(due.length === 1 ? `${first.title}${first.body ? ` · ${first.body}` : ''}` : `${due.length} reminders · see Coming up on Today`)
      }
    }
    const id = setInterval(check, CHECK_MS)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    // First check shortly after load, once saved data is in.
    const first = setTimeout(check, 1500)
    return () => {
      clearInterval(id)
      clearTimeout(first)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
