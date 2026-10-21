/**
 * WebCrypto helpers for the encrypted vault. Only `globalThis.crypto.subtle` is used, so the
 * same code runs in browsers and in Node 20+ tests.
 */

export const KDF_ITERATIONS = 600_000

const SALT_BYTES = 16
const IV_BYTES = 12
const MIN_PASSPHRASE_LENGTH = 10
const BASE64_CHUNK = 0x8000
/** Binds every ciphertext to this app and format version. */
const AAD = new TextEncoder().encode('nearer-vault-v1')

export interface Sealed {
  iv: string
  ciphertext: string
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase, or the encrypted data has been altered.')
    this.name = 'WrongPassphraseError'
  }
}

/** Chunked so large buffers never blow the argument limit of `String.fromCharCode`. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary)
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  let binary: string
  try {
    binary = atob(b64)
  } catch {
    throw new Error('Malformed base64 data.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function randomSalt(): string {
  return toBase64(randomBytes(SALT_BYTES))
}

export async function deriveKey(
  passphrase: string,
  saltB64: string,
  iterations: number = KDF_ITERATIONS,
): Promise<CryptoKey> {
  const salt = fromBase64(saltB64)
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function seal(key: CryptoKey, data: unknown): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES)
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, plain)
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(cipher)) }
}

async function decrypt(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<ArrayBuffer> {
  try {
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, data)
  } catch {
    throw new WrongPassphraseError()
  }
}

export async function open(key: CryptoKey, sealed: Sealed): Promise<unknown> {
  const iv = fromBase64(sealed.iv)
  const data = fromBase64(sealed.ciphertext)
  if (iv.length !== IV_BYTES) throw new Error('Malformed initialization vector.')
  const plain = await decrypt(key, iv, data)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)) as unknown
  } catch {
    throw new Error('Decrypted data is not valid JSON.')
  }
}

/** Returns a user-facing problem, or null when the passphrase is acceptable. */
export function validatePassphrase(passphrase: string): string | null {
  const chars = [...passphrase]
  if (passphrase.trim().length === 0) return 'The passphrase cannot be empty or only spaces.'
  if (chars.length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`
  }
  if (new Set(chars).size === 1) return 'Do not repeat a single character.'
  return null
}
