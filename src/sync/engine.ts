import { KDF_ITERATIONS, deriveKey, open, randomSalt, seal, type Sealed } from './crypto'
import { parseSyncDoc, type SyncDoc } from './doc'
import { docsEqual, mergeDocs } from './merge'

export interface VaultRecord {
  salt: string
  iterations: number
  iv: string
  ciphertext: string
  version: number
  updatedAt: string
}

export interface NewVault {
  salt: string
  iterations: number
  iv: string
  ciphertext: string
}

/** Transport-agnostic storage of the single encrypted vault row. */
export interface SyncBackend {
  /** Stable id of the vault's owner; bound into each ciphertext so rows can't be swapped between users. */
  readonly owner?: string
  getVault(): Promise<VaultRecord | null>
  /** Throws `VaultExistsError` if the user already has a vault. */
  createVault(rec: NewVault): Promise<VaultRecord>
  /** Throws `ConflictError` if the stored version is not `expectedVersion`. */
  updateVault(sealed: Sealed, expectedVersion: number): Promise<VaultRecord>
  /** Overwrites everything (new salt/passphrase): "reset vault". */
  replaceVault(rec: NewVault): Promise<VaultRecord>
}

export class ConflictError extends Error {
  constructor(message = 'The vault was changed by another device.') {
    super(message)
    this.name = 'ConflictError'
  }
}

export class VaultExistsError extends Error {
  constructor(message = 'A vault already exists for this account.') {
    super(message)
    this.name = 'VaultExistsError'
  }
}

export class NoVaultError extends Error {
  constructor(message = 'No vault exists for this account yet.') {
    super(message)
    this.name = 'NoVaultError'
  }
}

/** The vault is readable but unusable: unknown document format or unsafe KDF parameters. */
export class VaultFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultFormatError'
  }
}

/** Anything below this is refused on unlock: a hostile server could otherwise weaken the key. */
export const MIN_ACCEPTED_ITERATIONS = 100_000
/** Anything above this is refused on unlock: it would freeze the device. */
export const MAX_ACCEPTED_ITERATIONS = 2_000_000

export interface UnlockOptions {
  /** Lowest KDF iteration count to accept. Only tests should lower it. */
  minIterations?: number
}

export interface VaultSession {
  key: CryptoKey
  record: VaultRecord
}

export interface UnlockedVault extends VaultSession {
  doc: SyncDoc
}

export interface SyncResult {
  doc: SyncDoc
  record: VaultRecord
  /** True when the merged result differs from the `local` document passed in. */
  changedLocal: boolean
  /** True when a new version was written to the backend. */
  pushed: boolean
}

/**
 * Authenticated context for the ciphertext stored at `version`. A server that serves an old
 * ciphertext under a newer version number, or another user's row, fails decryption.
 */
export function vaultContext(owner: string | undefined, version: number): string {
  return `${owner ?? ''}|v${version}`
}

async function newVault(
  backend: SyncBackend,
  passphrase: string,
  local: SyncDoc,
  iterations: number,
  version: number,
): Promise<{ key: CryptoKey; vault: NewVault }> {
  const salt = randomSalt()
  const key = await deriveKey(passphrase, salt, iterations)
  const sealed = await seal(key, local, vaultContext(backend.owner, version))
  return { key, vault: { salt, iterations, ...sealed } }
}

export async function createVault(
  backend: SyncBackend,
  passphrase: string,
  local: SyncDoc,
  iterations: number = KDF_ITERATIONS,
): Promise<VaultSession> {
  const { key, vault } = await newVault(backend, passphrase, local, iterations, 1)
  return { key, record: await backend.createVault(vault) }
}

/** Replaces the existing vault with one encrypted under a new passphrase and salt. */
export async function resetVault(
  backend: SyncBackend,
  passphrase: string,
  local: SyncDoc,
  iterations: number = KDF_ITERATIONS,
): Promise<VaultSession> {
  const current = await backend.getVault()
  const { key, vault } = await newVault(backend, passphrase, local, iterations, (current?.version ?? 0) + 1)
  return { key, record: await backend.replaceVault(vault) }
}

/** Opens a vault payload and insists on the current document format (never "repairs" it to empty). */
async function openDoc(key: CryptoKey, record: VaultRecord, owner: string | undefined): Promise<SyncDoc> {
  const raw = await open(key, { iv: record.iv, ciphertext: record.ciphertext }, vaultContext(owner, record.version))
  const isCurrent = typeof raw === 'object' && raw !== null && !Array.isArray(raw) && (raw as { v?: unknown }).v === 1
  if (!isCurrent) {
    throw new VaultFormatError('This vault was written by a different version of Nearer. Update the app and try again.')
  }
  return parseSyncDoc(raw)
}

function assertSafeIterations(iterations: number, min: number): void {
  const valid = Number.isInteger(iterations) && iterations >= min && iterations <= MAX_ACCEPTED_ITERATIONS
  if (!valid) throw new VaultFormatError('The vault uses unsafe key-derivation settings and was not opened.')
}

export async function unlockVault(
  backend: SyncBackend,
  passphrase: string,
  options: UnlockOptions = {},
): Promise<UnlockedVault> {
  const record = await backend.getVault()
  if (record === null) throw new NoVaultError()
  assertSafeIterations(record.iterations, options.minIterations ?? MIN_ACCEPTED_ITERATIONS)
  const key = await deriveKey(passphrase, record.salt, record.iterations)
  return { key, record, doc: await openDoc(key, record, backend.owner) }
}

/**
 * Pulls, merges and (if the merge changed anything remotely) pushes once. On a version
 * conflict the pull-merge-push is repeated, up to `maxRetries` extra times.
 */
export async function syncOnce(
  backend: SyncBackend,
  key: CryptoKey,
  local: SyncDoc,
  now: number,
  maxRetries = 3,
  /** Highest vault version this device has seen; anything older means the server rolled back. */
  minVersion = 0,
): Promise<SyncResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await syncAttempt(backend, key, local, now, minVersion)
    } catch (error) {
      if (!(error instanceof ConflictError) || attempt >= maxRetries) throw error
    }
  }
}

async function syncAttempt(
  backend: SyncBackend,
  key: CryptoKey,
  local: SyncDoc,
  now: number,
  minVersion: number,
): Promise<SyncResult> {
  const record = await backend.getVault()
  if (record === null) throw new NoVaultError()
  if (record.version < minVersion) {
    throw new VaultFormatError('Your cloud backup is older than what this device already synced. Nothing was changed.')
  }
  const remote = await openDoc(key, record, backend.owner)
  const merged = mergeDocs(local, remote, now)
  const changedLocal = !docsEqual(merged, local)
  if (docsEqual(merged, remote)) return { doc: merged, record, changedLocal, pushed: false }
  const sealed = await seal(key, merged, vaultContext(backend.owner, record.version + 1))
  const updated = await backend.updateVault(sealed, record.version)
  return { doc: merged, record: updated, changedLocal, pushed: true }
}
