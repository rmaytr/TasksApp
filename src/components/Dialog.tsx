import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'
import './Dialog.css'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}

/** Native modal <dialog>: free focus trapping, Escape to close and an inert background. */
export function Dialog({ open, onClose, title, children, wide = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  // Only a press that starts AND ends on the backdrop closes; a text drag released outside doesn't.
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog--wide' : ''}`}
      aria-labelledby="dialog-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose()
        pressedBackdrop.current = false
      }}
    >
      {open && (
        <div className="dialog__panel">
          <header className="dialog__head">
            <h2 id="dialog-title">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}
