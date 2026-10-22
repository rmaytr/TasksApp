import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import './Menu.css'

const GAP = 6
const EDGE = 8

export interface MenuAnchor {
  /** Open beside this element (the ⋯ button)… */
  el?: HTMLElement | null
  /** …or at a point (right-click). */
  x?: number
  y?: number
}

interface MenuProps {
  anchor: MenuAnchor | null
  onClose: () => void
  label: string
  children: ReactNode
}

/**
 * A small action menu. Rendered in a portal (inside an open <dialog> when the anchor is in
 * one) so clipped containers can't cut it off; placed below its anchor and flipped above
 * when there's no room. Arrow keys move between items, Escape or a click outside closes it,
 * and focus goes back to whatever opened it.
 */
export function Menu({ anchor, onClose, label, children }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const menu = ref.current
    if (!anchor || !menu) return
    const box = menu.getBoundingClientRect()
    const r = anchor.el?.getBoundingClientRect()
    const x = r ? r.right - box.width : (anchor.x ?? 0)
    const below = r ? r.bottom + GAP : (anchor.y ?? 0)
    const above = r ? r.top - GAP - box.height : (anchor.y ?? 0) - box.height
    const up = below + box.height > window.innerHeight - EDGE && above > EDGE
    const left = Math.min(Math.max(EDGE, x), window.innerWidth - box.width - EDGE)
    setPos({ top: up ? above : Math.min(below, window.innerHeight - box.height - EDGE), left, up })
  }, [anchor])

  useEffect(() => {
    if (!anchor) return
    returnTo.current = anchor.el ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"], [data-menu-focus]')
    first?.focus({ preventScroll: true })
    const close = (): void => onClose()
    const onDown = (e: PointerEvent): void => {
      if (ref.current?.contains(e.target as Node) || anchor.el?.contains(e.target as Node)) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      returnTo.current?.focus({ preventScroll: true })
    }
  }, [anchor, onClose])

  if (!anchor) return null

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key === 'Tab') {
      onClose()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next = items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]
    next?.focus()
  }

  const host = anchor.el?.closest('dialog[open]') ?? document.body
  return createPortal(
    <div
      ref={ref}
      className={`menu${pos?.up ? ' menu--up' : ''}`}
      role="menu"
      aria-label={label}
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    host,
  )
}

interface MenuItemProps {
  icon?: IconName
  children: ReactNode
  onSelect: () => void
  danger?: boolean
  hint?: string
  checked?: boolean
}

export function MenuItem({ icon, children, onSelect, danger = false, hint, checked }: MenuItemProps) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      className={`menu__item${danger ? ' menu__item--danger' : ''}`}
      onClick={onSelect}
    >
      {icon ? <Icon name={icon} size={16} /> : <span className="menu__spacer" />}
      <span className="menu__text">{children}</span>
      {hint && <span className="menu__hint num">{hint}</span>}
      {checked && <Icon name="check" size={15} />}
    </button>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="menu__label">{children}</p>
}

export function MenuDivider() {
  return <hr className="menu__divider" />
}
