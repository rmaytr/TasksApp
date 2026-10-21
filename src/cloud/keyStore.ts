import { del, get, set } from 'idb-keyval'

/*
 * The vault key is a non-extractable CryptoKey. IndexedDB stores it via structured
 * clone, so this device can decrypt without retyping the passphrase, yet script on
 * the page can only *use* the key, never read its bytes.
 *
 * Next to it we keep the salt it was derived with (to tell "passphrase changed elsewhere"
 * apart from "backup is damaged") and the highest vault version seen (rollback detection).
 */
export interface StoredVaultKey {
  key: CryptoKey
  salt: string
  version: number
}

const keyName = (userId: string): string => `nearer-vault-key:${userId}`
const LAST_USER = 'nearer-last-user'

function isStored(value: unknown): value is StoredVaultKey {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<StoredVaultKey>
  return v.key instanceof CryptoKey && typeof v.salt === 'string' && typeof v.version === 'number'
}

export async function loadVaultKey(userId: string): Promise<StoredVaultKey | undefined> {
  const value = await get<unknown>(keyName(userId))
  return isStored(value) ? value : undefined
}

export const saveVaultKey = (userId: string, entry: StoredVaultKey): Promise<void> => set(keyName(userId), entry)
export const forgetVaultKey = (userId: string): Promise<void> => del(keyName(userId))

/** The account that last synced on this device, so a different account never inherits its tasks. */
export const loadLastUser = (): Promise<string | undefined> => get<string>(LAST_USER)
export const saveLastUser = (userId: string): Promise<void> => set(LAST_USER, userId)
