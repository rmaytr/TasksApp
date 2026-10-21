import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { SyncBadge } from './SyncBadge'
import './TopBar.css'

/** Phone header: the brand (goes to Today), search and settings. Desktop uses the sidebar. */
export function TopBar() {
  const navigate = useStore((s) => s.navigate)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setQuickFindOpen = useStore((s) => s.setQuickFindOpen)
  return (
    <header className="topbar">
      <button type="button" className="brand topbar__brand" onClick={() => navigate({ view: 'home', area: null })} aria-label="Cairn, go to Today">
        <Logo size={26} />
        <span className="brand__name">Cairn</span>
      </button>
      <div className="topbar__actions">
        <button type="button" className="icon-btn" onClick={() => setQuickFindOpen(true)} aria-label="Search tasks">
          <Icon name="search" />
        </button>
        <SyncBadge compact />
        <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <Icon name="settings" />
        </button>
      </div>
    </header>
  )
}
