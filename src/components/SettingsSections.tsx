import { useEffect, useState } from 'react'
import {
  forgetApiKey,
  forgetInvite,
  loadApiKey,
  loadInvite,
  proxyAvailable,
  resetTransport,
  saveApiKey,
  saveInvite,
} from '../assist/assistant'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourLabel = (h: number): string =>
  new Date(2026, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export function ReminderSettings() {
  const reminders = useStore((s) => s.prefs.reminders)
  const setPrefs = useStore((s) => s.setPrefs)
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const set = (patch: Partial<typeof reminders>): void => setPrefs({ reminders: { ...reminders, ...patch } })

  return (
    <section>
      <h3>Reminders</h3>
      <label className="settings__toggle">
        <input type="checkbox" className="check check--square" checked={reminders.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Remind me about deadlines
      </label>
      {reminders.enabled && (
        <>
          <div className="settings__row">
            <label className="settings__inline">
              Morning of
              <select className="field" value={reminders.morningHour} onChange={(e) => set({ morningHour: Number(e.target.value) })}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings__inline">
              Evening before
              <select className="field" value={reminders.eveningHour} onChange={(e) => set({ eveningHour: Number(e.target.value) })}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="settings__note">
            {perm === 'granted' && 'Notifications are on. They arrive while Cairn is open or installed and running.'}
            {perm === 'denied' && 'Notifications are blocked for this site in your browser settings. You’ll still see reminders inside Cairn.'}
            {perm === 'unsupported' && 'This browser can’t show notifications. You’ll see reminders inside Cairn.'}
            {perm === 'default' && (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => void Notification.requestPermission().then(setPerm)}
              >
                <Icon name="bell" size={15} /> Allow notifications
              </button>
            )}
          </p>
        </>
      )}
    </section>
  )
}

/** The assistant is opt-in and explains exactly what leaves the device. */
export function AssistantSettings() {
  const mode = useStore((s) => s.prefs.ai)
  const setPrefs = useStore((s) => s.setPrefs)
  const showToast = useStore((s) => s.showToast)
  const [secret, setSecret] = useState('')
  const [hasSecret, setHasSecret] = useState(false)

  useEffect(() => {
    if (mode === 'off') return
    void (mode === 'byok' ? loadApiKey() : loadInvite()).then((v) => setHasSecret(Boolean(v)))
  }, [mode])

  const choose = (next: 'off' | 'proxy' | 'byok'): void => {
    resetTransport()
    setSecret('')
    setHasSecret(false)
    setPrefs({ ai: next })
  }

  const save = async (): Promise<void> => {
    if (!secret.trim()) return
    if (mode === 'byok') await saveApiKey(secret)
    else await saveInvite(secret)
    resetTransport()
    setSecret('')
    setHasSecret(true)
    showToast(mode === 'byok' ? 'API key saved on this device' : 'Invite code saved')
  }

  return (
    <section>
      <h3>
        <Icon name="sparkle" size={16} /> Assistant
      </h3>
      <p className="settings__note">
        Let Claude sort new tasks for you: dates, priority, area, steps, and what should come first. When it’s on, the
        text you type plus the titles, areas and due dates of your open tasks are sent to Anthropic’s API. Notes and steps
        stay on your device. Off by default.
      </p>
      <div className="seg" role="group" aria-label="Assistant">
        <button type="button" aria-pressed={mode === 'off'} onClick={() => choose('off')}>
          Off
        </button>
        {proxyAvailable && (
          <button type="button" aria-pressed={mode === 'proxy'} onClick={() => choose('proxy')}>
            Invite code
          </button>
        )}
        <button type="button" aria-pressed={mode === 'byok'} onClick={() => choose('byok')}>
          My own API key
        </button>
      </div>
      {mode !== 'off' && (
        <form
          className="settings__secret"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <input
            className="field"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={hasSecret ? 'Saved. Paste a new one to replace it.' : mode === 'byok' ? 'sk-ant-…' : 'Invite code from whoever shared Cairn'}
            aria-label={mode === 'byok' ? 'Anthropic API key' : 'Invite code'}
          />
          <button type="submit" className="btn" disabled={!secret.trim()}>
            Save
          </button>
          {hasSecret && (
            <button
              type="button"
              className="btn btn--ghost btn--danger"
              onClick={() => void (mode === 'byok' ? forgetApiKey() : forgetInvite()).then(() => {
                resetTransport()
                setHasSecret(false)
              })}
            >
              {mode === 'byok' ? 'Remove key' : 'Remove code'}
            </button>
          )}
        </form>
      )}
      {mode === 'byok' && (
        <p className="settings__note">
          Your key is stored only in this browser and sent only to api.anthropic.com. Usage is billed to your Anthropic
          account (about two cents per task with the default model).
        </p>
      )}
    </section>
  )
}
