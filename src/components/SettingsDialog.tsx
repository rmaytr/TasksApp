import { useEffect, useState } from 'react'
import { toJSON, toMarkdown } from '../lib/export'
import { areaStyle } from '../hooks'
import { MAX_AREAS } from '../model/defaults'
import { AREA_COLORS, type Area } from '../model/types'
import { useStore } from '../store/useStore'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import './SettingsDialog.css'

const SHORTCUTS: readonly [string, string][] = [
  ['/', 'Add a task'],
  ['1–5', 'Radar, Map, List, Focus, Reset'],
  ['Ctrl K', 'Find any task'],
  ['i', 'Import'],
  ['[ ]', 'On a radar dot: pull closer, push out'],
  ['z', 'Undo the last change'],
  ['Esc', 'Close the open task'],
]

const dateStamp = (): string => new Date().toISOString().slice(0, 10)

function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // Generous delay: Safari can start slow downloads after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen)
  const setOpen = useStore((s) => s.setSettingsOpen)
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Settings">
      {open && <SettingsBody />}
    </Dialog>
  )
}

function SettingsBody() {
  const theme = useStore((s) => s.prefs.theme)
  const shortcuts = useStore((s) => s.prefs.shortcuts)
  const setPrefs = useStore((s) => s.setPrefs)
  const areas = useStore((s) => s.areas)
  const tasks = useStore((s) => s.tasks)
  const addArea = useStore((s) => s.addArea)
  const clearEverything = useStore((s) => s.clearEverything)
  const setImportOpen = useStore((s) => s.setImportOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const [newArea, setNewArea] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null))
  }, [])

  return (
    <div className="dialog__body settings">
      <section>
        <h3>Look</h3>
        <div className="seg" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={theme === t} onClick={() => setPrefs({ theme: t })}>
              {t === 'system' ? 'Match device' : t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Areas</h3>
        <ul className="settings__areas">
          {areas.map((area) => (
            <AreaRow key={area.id} area={area} areas={areas} />
          ))}
        </ul>
        {areas.length < MAX_AREAS && (
          <form
            className="settings__add"
            onSubmit={(e) => {
              e.preventDefault()
              if (addArea(newArea)) setNewArea('')
            }}
          >
            <input className="field" value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="New area, e.g. Gym" maxLength={40} aria-label="New area name" />
            <button type="submit" className="btn" disabled={!newArea.trim()}>
              <Icon name="plus" size={16} /> Add
            </button>
          </form>
        )}
      </section>

      <section>
        <h3>Your data</h3>
        <p className="settings__note">
          Everything stays in this browser on this device. Nothing is uploaded and there is no account.
          {persisted === false && ' Your browser may clear it if storage runs low, so export a backup now and then.'}
        </p>
        <div className="settings__buttons">
          <button type="button" className="btn" onClick={() => download(`nearer-backup-${dateStamp()}.json`, toJSON(areas, tasks, new Date()), 'application/json')}>
            <Icon name="download" size={16} /> Back up (JSON)
          </button>
          <button type="button" className="btn" onClick={() => download(`nearer-${dateStamp()}.md`, toMarkdown(areas, tasks, new Date()), 'text/markdown')}>
            <Icon name="download" size={16} /> Export Markdown
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSettingsOpen(false)
              setImportOpen(true)
            }}
          >
            <Icon name="import" size={16} /> Import
          </button>
        </div>
        <div className="settings__danger">
          {confirmClear ? (
            <>
              <span>Delete all {tasks.length} tasks?</span>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  clearEverything()
                  setConfirmClear(false)
                }}
              >
                Delete everything
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--ghost btn--danger" onClick={() => setConfirmClear(true)} disabled={tasks.length === 0}>
              <Icon name="trash" size={16} /> Delete all tasks
            </button>
          )}
        </div>
      </section>

      <section>
        <h3>Keyboard</h3>
        <label className="settings__toggle">
          <input
            type="checkbox"
            className="check check--square"
            checked={shortcuts}
            onChange={(e) => setPrefs({ shortcuts: e.target.checked })}
          />
          Single-key shortcuts
        </label>
        <dl className="settings__keys">
          {SHORTCUTS.map(([key, what]) => (
            <div key={key}>
              <dt>
                <span className="kbd">{key}</span>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="settings__note">
        Tip: install Nearer from your browser’s menu (“Install app” or “Add to Home Screen”) to open it like an app,
        offline. Open source on{' '}
        <a href="https://github.com/rmaytr/TasksApp" target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </p>
    </div>
  )
}

function AreaRow({ area, areas }: { area: Area; areas: Area[] }) {
  const updateArea = useStore((s) => s.updateArea)
  const deleteArea = useStore((s) => s.deleteArea)
  const count = useStore((s) => s.tasks.filter((t) => t.areaId === area.id && !t.done).length)
  const [name, setName] = useState(area.name)
  const [syncedName, setSyncedName] = useState(area.name)
  if (syncedName !== area.name) {
    setSyncedName(area.name)
    setName(area.name)
  }
  const [removing, setRemoving] = useState(false)
  const others = areas.filter((a) => a.id !== area.id)
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '')
  // The chosen target may have been removed since; fall back to a real area.
  const target = others.some((a) => a.id === moveTo) ? moveTo : (others[0]?.id ?? '')

  return (
    <li className="settings__area" style={areaStyle(area)}>
      <div className="settings__area-main">
        <span className="dot" />
        <input
          className="settings__area-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() ? updateArea(area.id, { name: name.trim().slice(0, 40) }) : setName(area.name))}
          aria-label={`Rename ${area.name}`}
          maxLength={40}
        />
        <div className="settings__swatches" role="group" aria-label={`Color for ${area.name}`}>
          {AREA_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={area.color === c}
              aria-label={c}
              className="settings__swatch"
              style={{ background: `var(--area-${c})` }}
              onClick={() => updateArea(area.id, { color: c })}
            />
          ))}
        </div>
        {others.length > 0 && (
          <button type="button" className="icon-btn" onClick={() => setRemoving(!removing)} aria-label={`Remove ${area.name}`}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
      {removing && (
        <div className="settings__remove">
          <span>{count > 0 ? `Move its ${count} open tasks to` : 'Remove this area?'}</span>
          {count > 0 && (
            <select className="field" value={target} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move tasks to">
              {others.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn--danger" onClick={() => deleteArea(area.id, target)}>
            Remove {area.name}
          </button>
        </div>
      )}
    </li>
  )
}
