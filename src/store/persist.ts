import { del, get, set } from 'idb-keyval'
import type { StateStorage } from 'zustand/middleware'

const WRITE_DELAY_MS = 300

/**
 * IndexedDB storage for zustand `persist`, with writes debounced and flushed
 * when the page is hidden (mobile browsers kill backgrounded tabs without warning).
 */
export function createDebouncedIdbStorage(canWrite: () => boolean = () => true): StateStorage {
  let pending: { name: string; value: string } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!pending) return
    const { name, value } = pending
    pending = null
    set(name, value).catch((err: unknown) => reportStorageError(err))
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }

  return {
    getItem: async (name) => (await get<string>(name)) ?? null,
    setItem: (name, value) => {
      if (!canWrite()) return
      pending = { name, value }
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, WRITE_DELAY_MS)
    },
    removeItem: (name) => del(name),
  }
}

type ErrorListener = (message: string) => void
let errorListener: ErrorListener | null = null

export function onStorageError(listener: ErrorListener): void {
  errorListener = listener
}

function reportStorageError(err: unknown): void {
  const detail = err instanceof Error ? err.message : 'unknown error'
  errorListener?.(`Couldn't save to this device (${detail}). Export a backup from Settings.`)
}

/** Ask the browser not to evict our data under storage pressure (Safari's 7-day rule, etc.). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
