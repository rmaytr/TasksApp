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
  type VaultSession,
} from '../sync/engine'
import { mergeDocs } from '../sync/merge'
import { useStore } from '../store/useStore'
import { currentSession, deleteAccount, getClient, signOut } from './client'
import { cloudEnabled } from './config'
import { forgetVaultKey, loadLastUser, loadVaultKey, saveLastUser, saveVaultKey, type StoredVaultKey } from './keyStore'
import { SupabaseBackend } from './supabaseBackend'
import { forgetAssistantSecrets } from '../assist/assistant'

const PUSH_DELAY_MS = 2000
const POLL_MS = 60_000

interface Connection {
  client: SupabaseClient
  userId: string
  backend: SyncBackend
  vault: StoredVaultKey | null
}

let conn: Connection | null = null
let inFlight: Promise<void> | null = null
let again = false
let applying = false
let pushTimer: ReturnType<typeof setTimeout> | null = null
let started = false
let authSubscribed = false
let connecting: Promise<void> | null = null

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

/** Wakes sync up: reconnects after a failed start, otherwise pulls and pushes. */
function nudge(): void {
  if (!conn && mightBeSignedIn()) void connect()
  else void syncNow()
}

/** Called once at startup. Loads the Supabase client only for people who have signed in before. */
export function initCloud(): void {
  if (!cloudEnabled || started) return
  started = true
  setSync({ status: 'signed-out' })
  // Listeners first, so a slow or failed first connection still recovers later.
  window.addEventListener('online', nudge)
  window.addEventListener('offline', () => conn && setSync({ status: 'offline' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') nudge()
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') nudge()
  }, POLL_MS)
  useStore.subscribe((state, prev) => {
    const changed = state.tasks !== prev.tasks || state.areas !== prev.areas || state.tombstones !== prev.tombstones
    if (!changed || applying || !conn?.vault) return
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void syncNow(), PUSH_DELAY_MS)
  })
  if (mightBeSignedIn()) void connect()
}

/** Loads the client, restores any session and (once) listens for sign-in/sign-out. */
export function connect(): Promise<void> {
  connecting ??= doConnect().finally(() => {
    connecting = null
  })
  return connecting
}

async function doConnect(): Promise<void> {
  try {
    const client = await getClient()
    if (!authSubscribed) {
      authSubscribed = true
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session && session.user.id !== conn?.userId) void attach(client, session)
        if (event === 'SIGNED_OUT') void handleSignedOut()
      })
    }
    const session = await currentSession()
    if (session && session.user.id !== conn?.userId) await attach(client, session)
  } catch (error) {
    setSync({ status: navigator.onLine ? 'error' : 'offline', message: messageOf(error) })
  }
}

async function attach(client: SupabaseClient, session: Session): Promise<void> {
  const userId = session.user.id
  // A different account signing in on this device must not inherit the previous account's tasks.
  const lastUser = await loadLastUser()
  if (lastUser && lastUser !== userId) {
    useStore.getState().wipeLocal()
    useStore.getState().showToast('Cleared tasks from the previous account on this device.')
  }
  await saveLastUser(userId)
  const backend = new SupabaseBackend(client, userId)
  const c: Connection = { client, userId, backend, vault: (await loadVaultKey(userId)) ?? null }
  conn = c
  setSync({ email: session.user.email ?? null, message: null })
  if (c.vault) {
    setSync({ status: 'idle', vault: 'present' })
    await syncNow()
    return
  }
  setSync({ status: 'locked' })
  try {
    const record = await backend.getVault()
    if (conn === c) setSync({ vault: record ? 'present' : 'missing' })
  } catch (error) {
    if (conn === c) setSync({ status: 'error', message: messageOf(error) })
  }
}

/** Signed out anywhere (this tab, another tab, revoked session): forget this device's key too. */
async function handleSignedOut(): Promise<void> {
  const c = conn
  detach()
  if (c) await forgetVaultKey(c.userId).catch(() => undefined)
}

function detach(): void {
  conn = null
  if (pushTimer) clearTimeout(pushTimer)
  setSync({ status: 'signed-out', email: null, vault: 'unknown', lastSyncedAt: null, message: null })
}

/** Pull–merge–push once; concurrent calls coalesce into one follow-up run. */
export function syncNow(): Promise<void> {
  if (!conn?.vault) return Promise.resolve()
  if (inFlight) {
    again = true
    return inFlight
  }
  inFlight = runSync()
    .catch(() => undefined)
    .finally(() => {
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
  const vault = c?.vault
  if (!c || !vault) return
  if (!navigator.onLine) {
    setSync({ status: 'offline' })
    return
  }
  setSync({ status: 'syncing', message: null })
  const before = localDoc()
  try {
    const result = await syncOnce(c.backend, vault.key, before, Date.now(), 3, vault.version)
    // Signed out (or switched account) while the request was in flight: drop the result.
    if (conn !== c) return
    if (result.changedLocal) applyMerged(before, result.doc)
    if (result.record.version > vault.version) {
      c.vault = { ...vault, version: result.record.version }
      await saveVaultKey(c.userId, c.vault)
    }
    setSync({ status: 'idle', lastSyncedAt: Date.now(), vault: 'present' })
  } catch (error) {
    if (conn === c) await handleSyncError(c, error)
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
  try {
    if (error instanceof WrongPassphraseError) {
      // Same salt means the passphrase didn't change: the data itself is damaged or tampered.
      const record = await c.backend.getVault().catch(() => null)
      if (record && c.vault && record.salt === c.vault.salt) {
        setSync({
          status: 'error',
          message: 'Your cloud backup couldn’t be decrypted; it may be damaged. Tasks on this device are safe.',
        })
        return
      }
      await forgetVaultKey(c.userId)
      c.vault = null
      setSync({ status: 'locked', vault: 'present', message: 'Your passphrase was changed on another device. Enter the new one.' })
    } else if (error instanceof NoVaultError) {
      await forgetVaultKey(c.userId)
      c.vault = null
      setSync({ status: 'locked', vault: 'missing', message: 'Your encrypted backup was removed. Set it up again.' })
    } else {
      setSync({ status: navigator.onLine ? 'error' : 'offline', message: messageOf(error) })
    }
  } catch (inner) {
    setSync({ status: 'error', message: messageOf(inner) })
  }
}

/* ---------- Actions for the account panel ---------- */

/** First device: choose a passphrase, encrypt everything local and upload it. */
export async function createEncryptedBackup(passphrase: string): Promise<void> {
  const c = requireConn()
  try {
    await adopt(c, await createVault(c.backend, passphrase, localDoc()))
  } catch (error) {
    if (error instanceof VaultExistsError) setSync({ vault: 'present' })
    throw error
  }
}

/** Another device: decrypt the existing backup and merge it with what's here. */
export async function unlockEncryptedBackup(passphrase: string): Promise<void> {
  const c = requireConn()
  await adopt(c, await unlockVault(c.backend, passphrase))
}

/** Forgotten passphrase: replace the cloud copy with this device's data under a new passphrase. */
export async function resetEncryptedBackup(passphrase: string): Promise<void> {
  const c = requireConn()
  await adopt(c, await resetVault(c.backend, passphrase, localDoc()))
}

async function adopt(c: Connection, session: VaultSession): Promise<void> {
  if (conn !== c) return
  c.vault = { key: session.key, salt: session.record.salt, version: session.record.version }
  await saveVaultKey(c.userId, c.vault)
  setSync({ status: 'idle', vault: 'present', message: null })
  await syncNow()
}

export async function signOutCloud(options: { wipeDevice: boolean }): Promise<void> {
  const c = conn
  // Detach first so an in-flight sync can't write its result back after we clear things.
  detach()
  await inFlight
  if (c) await forgetVaultKey(c.userId)
  await signOut()
  if (options.wipeDevice) {
    useStore.getState().wipeLocal()
    await forgetAssistantSecrets()
  }
}

export async function deleteCloudAccount(): Promise<void> {
  const c = requireConn()
  try {
    await deleteAccount()
  } finally {
    await forgetVaultKey(c.userId)
  }
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
