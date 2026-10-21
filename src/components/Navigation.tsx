import { useMemo } from 'react'
import { areaStyle } from '../hooks'
import { MAX_AREAS } from '../model/defaults'
import { useStore, type View } from '../store/useStore'
import { Icon, type IconName } from './Icon'
import { Logo } from './Logo'
import { SyncBadge } from './SyncBadge'
import './Navigation.css'

const VIEW_ITEMS: readonly { view: View; label: string; icon: IconName; hint: string }[] = [
  { view: 'radar', label: 'Radar', icon: 'radar', hint: 'Everything at a glance' },
  { view: 'map', label: 'Map', icon: 'map', hint: 'Areas, tasks and steps as a tree' },
  { view: 'list', label: 'List', icon: 'list', hint: 'Edit and scan' },
  { view: 'focus', label: 'Focus', icon: 'focus', hint: 'One thing at a time' },
  { view: 'reset', label: 'Reset', icon: 'reset', hint: 'Weekly fresh start' },
]

export function Rail() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const setImportOpen = useStore((s) => s.setImportOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setQuickFindOpen = useStore((s) => s.setQuickFindOpen)

  return (
    <nav className="rail" aria-label="Main">
      <div className="rail__brand">
        <Logo />
        <span>Nearer</span>
      </div>
      <button type="button" className="rail__find" onClick={() => setQuickFindOpen(true)} aria-keyshortcuts="Control+K">
        <Icon name="search" size={18} />
        <span>Find a task</span>
        <span className="kbd" aria-hidden="true">
          Ctrl K
        </span>
      </button>
      <ul className="rail__views">
        {VIEW_ITEMS.map((item, i) => (
          <li key={item.view}>
            <button
              type="button"
              className="rail__view"
              aria-current={view === item.view ? 'page' : undefined}
              onClick={() => setView(item.view)}
              title={`${item.hint} (${i + 1})`}
              aria-keyshortcuts={String(i + 1)}
            >
              <Icon name={item.icon} />
              {item.label}
              <span className="kbd rail__key" aria-hidden="true">
                {i + 1}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <AreaFilter />
      <div className="rail__footer">
        <SyncBadge />
        <button type="button" className="btn btn--ghost" onClick={() => setImportOpen(true)}>
          <Icon name="import" size={18} /> Import
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setSettingsOpen(true)}>
          <Icon name="settings" size={18} /> Settings
        </button>
      </div>
    </nav>
  )
}

function AreaFilter() {
  const areas = useStore((s) => s.areas)
  const tasks = useStore((s) => s.tasks)
  const hidden = useStore((s) => s.prefs.hiddenAreas)
  const setPrefs = useStore((s) => s.setPrefs)
  const setNewAreaOpen = useStore((s) => s.setNewAreaOpen)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) if (!t.done) map.set(t.areaId, (map.get(t.areaId) ?? 0) + 1)
    return map
  }, [tasks])

  const toggle = (id: string): void =>
    setPrefs({ hiddenAreas: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id] })

  return (
    <section className="rail__areas" aria-labelledby="areas-heading">
      <h2 id="areas-heading" className="rail__heading">
        Areas
      </h2>
      <ul>
        {areas.map((area) => {
          const isHidden = hidden.includes(area.id)
          return (
            <li key={area.id}>
              <button
                type="button"
                className="rail__area"
                aria-pressed={!isHidden}
                onClick={() => toggle(area.id)}
                title={isHidden ? `Show ${area.name}` : `Hide ${area.name}`}
              >
                <span className="dot" style={areaStyle(area)} />
                <span className="rail__area-name">{area.name}</span>
                <span className="rail__count num">{counts.get(area.id) ?? 0}</span>
                <span className="rail__eye">
                  <Icon name={isHidden ? 'eyeOff' : 'eye'} size={16} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {areas.length < MAX_AREAS && (
        <button type="button" className="rail__new-area" onClick={() => setNewAreaOpen(true)}>
          <Icon name="plus" size={16} /> New area
        </button>
      )}
    </section>
  )
}

export function BottomNav() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  return (
    <nav className="bottom-nav" aria-label="Views">
      {VIEW_ITEMS.map((item) => (
        <button
          key={item.view}
          type="button"
          className="bottom-nav__item"
          aria-current={view === item.view ? 'page' : undefined}
          onClick={() => setView(item.view)}
        >
          <Icon name={item.icon} size={22} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
