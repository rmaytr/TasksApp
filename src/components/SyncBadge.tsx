import { cloudEnabled } from '../cloud/config'
import { useStore, type SyncStatus } from '../store/useStore'
import { Icon } from './Icon'

const LABEL: Record<SyncStatus, string> = {
  off: 'Back up & sync',
  'signed-out': 'Back up & sync',
  locked: 'Unlock sync',
  idle: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  error: 'Sync problem',
}

/** Opens the account dialog; doubles as the always-visible sync status. */
export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const status = useStore((s) => s.sync.status)
  const setAccountOpen = useStore((s) => s.setAccountOpen)
  if (!cloudEnabled) return null
  const label = LABEL[status]
  return (
    <button
      type="button"
      className={compact ? 'icon-btn sync-badge' : 'btn btn--ghost sync-badge'}
      data-status={status}
      onClick={() => setAccountOpen(true)}
      aria-label={compact ? label : undefined}
      title={label}
    >
      <Icon name={status === 'locked' ? 'lock' : 'cloud'} size={18} />
      {!compact && label}
      <span className="sync-badge__dot" aria-hidden="true" />
    </button>
  )
}
