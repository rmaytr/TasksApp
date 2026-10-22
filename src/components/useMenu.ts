import { useCallback, useState } from 'react'
import type { MenuAnchor } from './Menu'

/** Open state for a menu that can be opened from a ⋯ button or a right-click. */
export function useMenu(): {
  anchor: MenuAnchor | null
  openAt: (anchor: MenuAnchor) => void
  close: () => void
} {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null)
  const close = useCallback(() => setAnchor(null), [])
  return { anchor, openAt: setAnchor, close }
}
