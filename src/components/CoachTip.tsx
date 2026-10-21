import type { ReactNode } from 'react'
import { useStore } from '../store/useStore'
import './CoachTip.css'

/** A one-time hint that stays dismissed (remembered in prefs). */
export function CoachTip({ id, children }: { id: string; children: ReactNode }) {
  const seen = useStore((s) => s.prefs.seenTips.includes(id))
  const setPrefs = useStore((s) => s.setPrefs)
  const seenTips = useStore((s) => s.prefs.seenTips)
  if (seen) return null
  return (
    <div className="coach" role="note" onPointerDown={(e) => e.stopPropagation()}>
      <span>{children}</span>
      <button type="button" className="coach__ok" onClick={() => setPrefs({ seenTips: [...seenTips, id] })}>
        Got it
      </button>
    </div>
  )
}
