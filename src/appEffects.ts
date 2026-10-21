import { useEffect } from 'react'
import { useMediaQuery } from './hooks'
import { onStorageError } from './store/persist'
import { useStore, type View } from './store/useStore'

const VIEWS: readonly View[] = ['radar', 'list', 'focus', 'reset']

export const VIEW_TITLE: Record<View, string> = { radar: 'Radar', list: 'List', focus: 'Focus', reset: 'Weekly reset' }

/** Applies the chosen or system theme to <html data-theme> and the browser chrome color. */
export function useTheme(): void {
  const theme = useStore((s) => s.prefs.theme)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', resolved === 'dark' ? '#121920' : '#e8ece6')
  }, [resolved])
}

/** Mirrors the active view in location.hash so refresh and the back button behave. */
export function useHashView(): void {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)

  useEffect(() => {
    const read = (): void => {
      const fromHash = location.hash.replace('#', '') as View
      if (VIEWS.includes(fromHash)) setView(fromHash)
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [setView])

  useEffect(() => {
    document.title = `${VIEW_TITLE[view]} · Nearer`
    if (location.hash === `#${view}`) return
    if (location.hash) history.pushState(null, '', `#${view}`)
    else history.replaceState(null, '', `#${view}`)
  }, [view])
}

export const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export const isModalOpen = (): boolean => document.querySelector('dialog[open]') !== null

/** Global single-key shortcuts; ignored while typing or when a modal dialog is open. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (isModalOpen()) return
      const s = useStore.getState()
      if (!s.prefs.shortcuts) return
      if (e.key === '/' || e.key === 'n') {
        e.preventDefault()
        document.getElementById('capture-input')?.focus()
      } else if (e.key >= '1' && e.key <= '4') {
        s.setView(VIEWS[Number(e.key) - 1])
      } else if (e.key === 'i') {
        s.setImportOpen(true)
      } else if (e.key === 'Escape' && s.selectedId) {
        s.select(null)
      } else if (e.key === 'z' && s.undoSnapshot) {
        s.undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function useStorageErrors(): void {
  useEffect(() => onStorageError((message) => useStore.getState().showToast(message, false, true)), [])
}
