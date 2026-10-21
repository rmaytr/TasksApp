import { del, get, set } from 'idb-keyval'

/*
 * The vault key is a non-extractable CryptoKey. IndexedDB stores it via structured
 * clone, so this device can decrypt without retyping the passphrase, yet script on
 * the page can only *use* the key, never read its bytes.
 */
const keyName = (userId: string): string => `nearer-vault-key:${userId}`

export const loadVaultKey = (userId: string): Promise<CryptoKey | undefined> => get<CryptoKey>(keyName(userId))
export const saveVaultKey = (userId: string, key: CryptoKey): Promise<void> => set(keyName(userId), key)
export const forgetVaultKey = (userId: string): Promise<void> => del(keyName(userId))
