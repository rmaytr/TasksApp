import { del, get, set } from 'idb-keyval'
import { AiError, type AiTransport } from '../ai/types'
import { useStore } from '../store/useStore'

/*
 * The assistant talks to Claude either through the operator's proxy (a Cloudflare Worker
 * holding the API key) or with the user's own key. Secrets live in IndexedDB on this device
 * only: never in exports, sync or the URL.
 */
const KEY_SLOT = 'cairn-ai-key'
const INVITE_SLOT = 'cairn-ai-invite'

export const proxyUrl = ((import.meta.env.VITE_AI_PROXY_URL as string | undefined) ?? '').trim().replace(/\/$/, '')
export const proxyAvailable = /^(https:\/\/|http:\/\/localhost(:\d+)?(\/|$))/.test(proxyUrl)

export const loadApiKey = (): Promise<string | undefined> => get<string>(KEY_SLOT)
export const saveApiKey = (key: string): Promise<void> => set(KEY_SLOT, key.trim())
export const forgetApiKey = (): Promise<void> => del(KEY_SLOT)
export const loadInvite = (): Promise<string | undefined> => get<string>(INVITE_SLOT)
export const saveInvite = (code: string): Promise<void> => set(INVITE_SLOT, code.trim())
export const forgetInvite = (): Promise<void> => del(INVITE_SLOT)

/** "Sign out and clear this device" also forgets the assistant's key and invite code. */
export async function forgetAssistantSecrets(): Promise<void> {
  await Promise.all([forgetApiKey(), forgetInvite()])
  resetTransport()
  useStore.getState().setPrefs({ ai: 'off' })
}

let cached: { mode: string; secret: string; transport: AiTransport } | null = null

/** The transport for the current settings, or null when the assistant is off or not set up. */
export async function getTransport(): Promise<AiTransport | null> {
  const mode = useStore.getState().prefs.ai
  if (mode === 'off') return null
  const secret = (mode === 'byok' ? await loadApiKey() : await loadInvite()) ?? ''
  if (!secret || (mode === 'proxy' && !proxyAvailable)) return null
  if (cached?.mode === mode && cached.secret === secret) return cached.transport
  // Loaded on first use so people who never turn the assistant on don't download the SDK.
  const { createByokTransport, createProxyTransport } = await import('../ai/transports')
  const transport = mode === 'byok' ? createByokTransport(secret) : createProxyTransport(proxyUrl, secret)
  cached = { mode, secret, transport }
  return transport
}

export function resetTransport(): void {
  cached = null
}

/** User-facing words for each failure; capture always falls back to the plain task. */
export function assistantError(error: unknown): string {
  if (!(error instanceof AiError)) return 'The assistant didn’t answer, so the task was saved as you typed it.'
  const mode = useStore.getState().prefs.ai
  switch (error.kind) {
    case 'auth':
      return mode === 'byok' ? 'Your API key wasn’t accepted. Check it in Settings.' : 'Your invite code wasn’t accepted. Check it in Settings.'
    case 'rate':
      return 'The assistant is busy. Try again in a moment.'
    case 'network':
      return 'Couldn’t reach the assistant. The task was saved as you typed it.'
    case 'refusal':
      return 'The assistant couldn’t help with that one. It’s saved as you typed it.'
    case 'config':
      return 'The assistant isn’t set up yet. Add a key or invite code in Settings.'
    default:
      return 'The assistant’s answer didn’t make sense, so the task was saved as you typed it.'
  }
}
