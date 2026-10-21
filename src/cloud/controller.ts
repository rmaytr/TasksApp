import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { WrongPassphraseError } from '../sync/crypto'
import type { SyncDoc } from '../sync/doc'
import {
  createVault,
  NoVaultError,
  resetVault,
  syncOnce,
  unlockVault,
  VaultExistsError,
  VaultFormatError,
  type SyncBackend,
} from '../sync/engine'
import { mergeDocs } from '../sync/merge'
import { useStore } from '../store/useStore'
import { currentSession, deleteAccount, getClient, signOut } from './client'
import { cloudEnabled } from './config'
import { forgetVaultKey, loadVaultKey, saveVaultKey } from './keyStore'
import { SupabaseBackend } from './supabaseBackend'

const PUSH_DELAY_MS = 2000
const POLL_MS = 60_000

interface Connection {
  client: SupabaseClient
  userId: string
  backend: SyncBackend
  key: CryptoKey | null
}

let conn: Connection | null = null
let inFlight: Promise<void> | null = null
let again = false
let applying = false
let pushTimer: ReturnType<typeof setTimeout> | null = null
let started = false

const setSync = (patch: Parameters<ReturnType<typeof useStore.getState>['setSync']>[0]): void =>
  useStore.getState().setSync(patch)

function localDoc(): SyncDoc {
  const { areas, tasks, tombstones } = useStore.getState()
  return { v: 1, areas, tasks, tombstones }
}

/** A stored sign-in exists only if supabase-js left its token in localStorage (or we're returning from a link). */
function mightBeSignedIn(): boolean {
  try {
    const returning = /[?&#](code|access_token|error_description)=/.test(location.href)
    return returning || Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
  } catch {
    return false
  }
}

/** Called once at startup. Loads the Supabase client only for people who have signed in before. */
export async function initCloud(): Promise<void> {
  if (!cloudEnabled || started) return
  started = true
  setSync({ status: 'signed-out' })
  if (mightBeSignedIn()) await connect()
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  setInterval(() => void syncNow(), POLL_MS)
  useStore.subscribe((state, prev) => {
    const changed = state.tasks !== prev.tasks || state.areas !== prev.areas || state.tombstones !== prev.tombstones
    if (!changed || applying || !conn?.key) return
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void syncNow(), PUSH_DELAY_MS)
  })
}

/** Loads the client, restores any session and listens for sign-in/sign-out. */
export async function connect(): Promise<void> {
  try {
    const client = await getClient()
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && session.user.id !== conn?.userId) void attach(client, session)
      if (event === 'SIGNED_OUT') detach()
    })
    const session = await currentSession()
    if (session) await attach(client, session)
  } catch (error) {
    setSync({ status: 'error', message: messageOf(error) })
  }
}

async function attach(client: SupabaseClient, session: Session): Promise<void> {
  const userId = session.user.id
  const backend = new SupabaseBackend(client, userId)
  conn = { client, userId, backend, key: (await loadVaultKey(userId)) ?? null }
  setSync({ email: session.user.email ?? null, message: null })
  if (conn.key) {
    setSync({ status: 'idle', vault: 'present' })
    await syncNow()
    return
  }
  setSync({ status: 'locked' })
  try {
    setSync({ vault: (await backend.getVault()) ? 'present' : 'missing' })
  } catch (error) {
    setSync({ status: 'error', message: messageOf(error) })
  }
}

function detach(): void {
  conn = null
  setSync({ status: 'signed-out', email: null, vault: 'unknown', lastSyncedAt: null, message: null })
}

/** Pull–merge–push once; concurrent calls coalesce into one follow-up run. */
export function syncNow(): Promise<void> {
  if (!conn?.key) return Promise.resolve()
  if (inFlight) {
    again = true
    return inFlight
  }
  inFlight = runSync().finally(() => {
    inFlight = null
    if (again) {
      again = false
      void syncNow()
    }
  })
  return inFlight
}

async function runSync(): Promise<void> {
  const c = conn
  if (!c?.key) return
  if (!navigator.onLine) {
    setSync({ status: 'offline' })
    return
  }
  setSync({ status: 'syncing', message: null })
  const before = localDoc()
  try {
    const result = await syncOnce(c.backend, c.key, before, Date.now())
    if (result.changedLocal) applyMerged(before, result.doc)
    setSync({ status: 'idle', lastSyncedAt: Date.now(), vault: 'present' })
  } catch (error) {
    await handleSyncError(c, error)
  }
}

/** Applies the merged doc, folding in any edits the user made while the request was in flight. */
function applyMerged(before: SyncDoc, merged: SyncDoc): void {
  const now = localDoc()
  const editedMeanwhile = now.tasks !== before.tasks || now.areas !== before.areas || now.tombstones !== before.tombstones
  const next = editedMeanwhile ? mergeDocs(now, merged, Date.now()) : merged
  applying = true
  try {
    useStore.getState().applySynced(next)
  } finally {
    applying = false
  }
  if (editedMeanwhile) again = true
}

async function handleSyncError(c: Connection, error: unknown): Promise<void> {
  if (error instanceof WrongPassphraseError) {
    await forgetVaultKey(c.userId)
    c.key = null
    setSync({ status: 'locked', vault: 'present', message: 'Your passphrase was changed on another device. Enter the new one.' })
  } else if (error instanceof NoVaultError) {
    await forgetVaultKey(c.userId)
    c.key = null
    setSync({ status: 'locked', vault: 'missing', message: 'Your encrypted backup was removed. Set it up again.' })
  } else {
    setSync({ status: navigator.onLine ? 'error' : 'offline', message: messageOf(error) })
  }
}

/* ---------- Actions for the account panel ---------- */

/** First device: choose a passphrase, encrypt everything local and upload it. */
export async function createEncryptedBackup(passphrase: string): Promise<void> {
  const c = requireConn()
  try {
    const { key } = await createVault(c.backend, passphrase, localDoc())
    await adoptKey(c, key)
  } catch (error) {
    if (error instanceof VaultExistsError) setSync({ vault: 'present' })
    throw error
  }
}

/** Another device: decrypt the existing backup and merge it with what's here. */
export async function unlockEncryptedBackup(passphrase: string): Promise<void> {
  const c = requireConn()
  const { key } = await unlockVault(c.backend, passphrase)
  await adoptKey(c, key)
}

/** Forgotten passphrase: replace the cloud copy with this device's data under a new passphrase. */
export async function resetEncryptedBackup(passphrase: string): Promise<void> {
  const c = requireConn()
  const { key } = await resetVault(c.backend, passphrase, localDoc())
  await adoptKey(c, key)
}

async function adoptKey(c: Connection, key: CryptoKey): Promise<void> {
  c.key = key
  await saveVaultKey(c.userId, key)
  setSync({ status: 'idle', vault: 'present', message: null })
  await syncNow()
}

export async function signOutCloud(options: { wipeDevice: boolean }): Promise<void> {
  if (conn) await forgetVaultKey(conn.userId)
  await signOut()
  detach()
  if (options.wipeDevice) useStore.getState().applySynced({ areas: [], tasks: [], tombstones: [] })
}

export async function deleteCloudAccount(): Promise<void> {
  const c = requireConn()
  await deleteAccount()
  await forgetVaultKey(c.userId)
  detach()
}

function requireConn(): Connection {
  if (!conn) throw new Error('Sign in first.')
  return conn
}

export function messageOf(error: unknown): string {
  if (error instanceof WrongPassphraseError) return 'That passphrase doesn’t match your encrypted backup.'
  if (error instanceof VaultFormatError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong. Try again.'
}
