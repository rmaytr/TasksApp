import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import './Toast.css'

const TOAST_MS = 5000
const UNDO_TOAST_MS = 10_000

export function Toast() {
  const toast = useStore((s) => s.toast)
  const dismiss = useStore((s) => s.dismissToast)
  const undo = useStore((s) => s.undo)
  // Hovering or focusing the toast pauses its timer so Undo stays reachable (WCAG 2.2.1).
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!toast || toast.sticky || paused) return
    const id = setTimeout(dismiss, toast.undoable ? UNDO_TOAST_MS : TOAST_MS)
    return () => clearTimeout(id)
  }, [toast, dismiss, paused])

  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="toast"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <span className="toast__msg">{toast.message}</span>
            {toast.undoable && (
              <button type="button" className="toast__undo" onClick={undo} aria-keyshortcuts="z" title="Undo (Z)">
                Undo
              </button>
            )}
            {toast.sticky && (
              <button type="button" className="toast__undo" onClick={dismiss} aria-label="Dismiss">
                <Icon name="close" size={16} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
