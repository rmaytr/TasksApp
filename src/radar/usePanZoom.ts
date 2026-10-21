import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export interface ViewTransform {
  k: number
  x: number
  y: number
}

const MIN_K = 0.6
const MAX_K = 4
const IDENTITY: ViewTransform = { k: 1, x: 0, y: 0 }

const clampK = (k: number): number => Math.min(MAX_K, Math.max(MIN_K, k))

/**
 * Wheel/pinch zoom around the pointer and drag-to-pan on the background.
 * Pan offsets are in screen pixels relative to the centered radar.
 */
export function usePanZoom(ref: RefObject<HTMLElement | null>, size: { w: number; h: number }) {
  const [t, setT] = useState<ViewTransform>(IDENTITY)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ dist: number; k: number } | null>(null)

  /** Zooms by `factor` keeping the screen point (px, py) fixed. */
  const zoomAt = useCallback(
    (factor: number, px: number, py: number) =>
      setT((prev) => {
        const k = clampK(prev.k * factor)
        const ratio = k / prev.k
        const cx = size.w / 2 + prev.x
        const cy = size.h / 2 + prev.y
        return { k, x: prev.x + (px - cx) * (1 - ratio), y: prev.y + (py - cy) * (1 - ratio) }
      }),
    [size.w, size.h],
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018))
      zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, zoomAt])

  const onBackgroundPointerDown = (e: ReactPointerEvent): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: t.k }
    }
  }

  const onBackgroundPointerMove = (e: ReactPointerEvent): void => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinchStart.current && ref.current) {
      const [a, b] = [...pointers.current.values()]
      const rect = ref.current.getBoundingClientRect()
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const target = clampK((pinchStart.current.k * dist) / pinchStart.current.dist)
      zoomAt(target / t.k, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top)
      return
    }
    setT((p) => ({ ...p, x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }))
  }

  const onBackgroundPointerUp = (e: ReactPointerEvent): void => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
  }

  return {
    transform: t,
    setTransform: setT,
    reset: () => setT(IDENTITY),
    zoomBy: (factor: number) => zoomAt(factor, size.w / 2 + t.x, size.h / 2 + t.y),
    handlers: {
      onPointerDown: onBackgroundPointerDown,
      onPointerMove: onBackgroundPointerMove,
      onPointerUp: onBackgroundPointerUp,
      onPointerCancel: onBackgroundPointerUp,
    },
  }
}
