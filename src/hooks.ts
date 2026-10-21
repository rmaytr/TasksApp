import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react'
import type { Area } from './model/types'
import { useStore } from './store/useStore'

const MINUTE = 60_000

/** Current time, refreshed every minute so "today" rolls over at midnight. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), MINUTE)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return now
}

export function useAreaMap(): Map<string, Area> {
  const areas = useStore((s) => s.areas)
  return useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas])
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

export const areaColor = (area: Area | undefined): string =>
  area ? `var(--area-${area.color})` : 'var(--ink-3)'

/** Inline style that exposes an area's color as `--c` for dots, checks and accents. */
export const areaStyle = (area: Area | undefined): CSSProperties => ({ '--c': areaColor(area) }) as CSSProperties

/** Area color darkened where needed so it passes 4.5:1 as text. */
export const areaTextColor = (area: Area | undefined): string =>
  area ? `var(--area-${area.color}-text)` : 'var(--ink-3)'
