import { useId, useMemo, useState } from 'react'
import { areaStyle } from '../hooks'
import { MAX_AREAS } from '../model/defaults'
import { useStore, type View } from '../store/useStore'
import { Dialog } from './Dialog'
import { Icon, type IconName } from './Icon'
import { Logo } from './Logo'
import { SyncBadge } from './SyncBadge'
import './Navigation.css'

const NAV: readonly { view: View; label: string; icon: IconName; key: string }[] = [
  { view: 'home', label: 'Today', icon: 'home', key: '1' },
  { view: 'tasks', label: 'All tasks', icon: 'list', key: '2' },
  { view: 'focus', label: 'Focus', icon: 'focus', key: '3' },
]

function useOpenCounts(): Map<string, number> {
  const tasks = useStore((s) => s.tasks)
  return useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) if (!t.done) map.set(t.areaId, (map.get(t.areaId) ?? 0) + 1)
    return map
  }, [tasks])
}

/** The brand doubles as the Home button, like most apps. */
function Brand() {
  const navigate = useStore((s) => s.navigate)
  return (
    <button type="button" className="brand" onClick={() => navigate({ view: 'home', area: null })} aria-label="Cairn, go to Today">
      <Logo />
      <span className="brand__name">Cairn</span>
    </button>
  )
}

export function Sidebar() {
  const view = useStore((s) => s.view)
  const areaFilter = useStore((s) => s.areaFilter)
  const navigate = useStore((s) => s.navigate)
  const setImportOpen = useStore((s) => s.setImportOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setQuickFindOpen = useStore((s) => s.setQuickFindOpen)
  const setQuickAddOpen = useStore((s) => s.setQuickAddOpen)

  return (
    <nav className="side" aria-label="Main">
      <Brand />
      <div className="side__actions">
        <button type="button" className="btn btn--primary side__add" onClick={() => setQuickAddOpen(true)} aria-keyshortcuts="n">
          <Icon name="plus" size={18} /> New task
        </button>
        <button type="button" className="side__find" onClick={() => setQuickFindOpen(true)} aria-keyshortcuts="Control+K">
          <Icon name="search" size={17} />
          <span>Search</span>
          <span className="kbd" aria-hidden="true">
            Ctrl K
          </span>
        </button>
      </div>
      <ul className="side__nav">
        {NAV.map((item) => {
          const active = view === item.view && !(item.view === 'tasks' && areaFilter)
          return (
            <li key={item.view}>
              <button
                type="button"
                className="side__link"
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate({ view: item.view, area: null })}
                aria-keyshortcuts={item.key}
              >
                <Icon name={item.icon} size={19} />
                {item.label}
              </button>
            </li>
          )
        })}
      </ul>
      <AreaNav />
      <div className="side__footer">
        <SyncBadge />
        <button type="button" className="side__link side__link--small" onClick={() => setImportOpen(true)}>
          <Icon name="import" size={18} /> Import
        </button>
        <button type="button" className="side__link side__link--small" onClick={() => setSettingsOpen(true)}>
          <Icon name="settings" size={18} /> Settings
        </button>
      </div>
    </nav>
  )
}

/** Each area opens its own page (Tasks filtered to that area). */
function AreaNav({ onPick }: { onPick?: () => void }) {
  const areas = useStore((s) => s.areas)
  const areaFilter = useStore((s) => s.areaFilter)
  const view = useStore((s) => s.view)
  const navigate = useStore((s) => s.navigate)
  const setNewAreaOpen = useStore((s) => s.setNewAreaOpen)
  const counts = useOpenCounts()
  const headingId = useId()

  return (
    <section className="side__areas" aria-labelledby={headingId}>
      <h2 id={headingId} className="side__heading">
        Areas
      </h2>
      <ul>
        {areas.map((area) => (
          <li key={area.id}>
            <button
              type="button"
              className="side__area"
              style={areaStyle(area)}
              aria-current={view === 'tasks' && areaFilter === area.id ? 'page' : undefined}
              onClick={() => {
                navigate({ view: 'tasks', area: area.id })
                onPick?.()
              }}
            >
              <span className="side__area-dot" />
              <span className="side__area-name">{area.name}</span>
              <span className="side__count num">{counts.get(area.id) ?? 0}</span>
            </button>
          </li>
        ))}
      </ul>
      {areas.length < MAX_AREAS && (
        <button
          type="button"
          className="side__link side__link--small side__new-area"
          onClick={() => {
            setNewAreaOpen(true)
            onPick?.()
          }}
        >
          <Icon name="plus" size={17} /> New area
        </button>
      )}
    </section>
  )
}

const TABS: readonly { view: View; label: string; icon: IconName }[] = [
  { view: 'home', label: 'Today', icon: 'home' },
  { view: 'tasks', label: 'Tasks', icon: 'list' },
]

/** Phone navigation: Today · Tasks · [+] · Focus · More. */
export function BottomNav() {
  const view = useStore((s) => s.view)
  const navigate = useStore((s) => s.navigate)
  const setQuickAddOpen = useStore((s) => s.setQuickAddOpen)
  const [moreOpen, setMoreOpen] = useState(false)

  const tab = (item: { view: View; label: string; icon: IconName }) => (
    <button
      key={item.view}
      type="button"
      className="tabs__item"
      aria-current={view === item.view ? 'page' : undefined}
      onClick={() => navigate({ view: item.view, area: null })}
    >
      <Icon name={item.icon} size={22} />
      <span>{item.label}</span>
    </button>
  )

  return (
    <>
      <nav className="tabs" aria-label="Views">
        {TABS.map(tab)}
        <button type="button" className="tabs__add" onClick={() => setQuickAddOpen(true)} aria-label="New task">
          <Icon name="plus" size={26} />
        </button>
        {tab({ view: 'focus', label: 'Focus', icon: 'focus' })}
        <button type="button" className="tabs__item" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          <Icon name="menu" size={22} />
          <span>More</span>
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setImportOpen = useStore((s) => s.setImportOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const navigate = useStore((s) => s.navigate)
  return (
    <Dialog open={open} onClose={onClose} title="More">
      {open && (
        <div className="dialog__body more">
          <AreaNav onPick={onClose} />
          <div className="more__links">
            <button
              type="button"
              className="side__link"
              onClick={() => {
                navigate({ view: 'reset', area: null })
                onClose()
              }}
            >
              <Icon name="reset" size={19} /> Weekly reset
            </button>
            <button
              type="button"
              className="side__link"
              onClick={() => {
                onClose()
                setImportOpen(true)
              }}
            >
              <Icon name="import" size={19} /> Import
            </button>
            <button
              type="button"
              className="side__link"
              onClick={() => {
                onClose()
                setSettingsOpen(true)
              }}
            >
              <Icon name="settings" size={19} /> Settings
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
