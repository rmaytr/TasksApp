import { useStore } from '../store/useStore'
import { CaptureBar } from './CaptureBar'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { SyncBadge } from './SyncBadge'
import './TopBar.css'

export function TopBar() {
  const setImportOpen = useStore((s) => s.setImportOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  return (
    <header className="topbar">
      <div className="topbar__brand" aria-hidden="true">
        <Logo size={24} />
      </div>
      <CaptureBar />
      <div className="topbar__actions">
        <SyncBadge compact />
        <button type="button" className="icon-btn" onClick={() => setImportOpen(true)} aria-label="Import tasks">
          <Icon name="import" />
        </button>
        <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <Icon name="settings" />
        </button>
      </div>
    </header>
  )
}
