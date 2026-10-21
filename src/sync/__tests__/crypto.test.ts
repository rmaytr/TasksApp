import { describe, expect, it } from 'vitest'
import {
  KDF_ITERATIONS,
  WrongPassphraseError,
  deriveKey,
  fromBase64,
  open,
  randomSalt,
  seal,
  toBase64,
  validatePassphrase,
} from '../crypto'

const FAST = 1000
const PASS = 'correct horse battery'

describe('base64 helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 255])
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes))
  })

  it('round-trips an empty buffer', () => {
    expect(toBase64(new Uint8Array(0))).toBe('')
    expect(fromBase64('').length).toBe(0)
  })

  it('handles buffers far larger than the argument limit of String.fromCharCode', () => {
    const big = new Uint8Array(3_000_000)
    for (let i = 0; i < big.length; i++) big[i] = i % 251
    const back = fromBase64(toBase64(big))
    expect(back.length).toBe(big.length)
    expect(back[2_999_999]).toBe(2_999_999 % 251)
  })

  it('throws a generic error for malformed base64', () => {
    expect(() => fromBase64('***not base64***')).toThrow(Error)
    expect(() => fromBase64('***not base64***')).not.toThrow(WrongPassphraseError)
  })
})

describe('randomSalt', () => {
  it('is 16 random bytes in base64 and differs between calls', () => {
    const a = randomSalt()
    expect(fromBase64(a).length).toBe(16)
    expect(randomSalt()).not.toBe(a)
  })
})

describe('KDF_ITERATIONS', () => {
  it('is 600k', () => {
    expect(KDF_ITERATIONS).toBe(600_000)
  })
})

describe('seal / open', () => {
  it('round-trips structured data including unicode', async () => {
    const key = await deriveKey(PASS, randomSalt(), FAST)
    const data = { a: [1, 2, 3], s: 'zażółć gęślą 🚀', n: null }
    expect(await open(key, await seal(key, data))).toEqual(data)
  })

  it('uses a fresh IV for every seal', async () => {
    const key = await deriveKey(PASS, randomSalt(), FAST)
    const a = await seal(key, { x: 1 })
    const b = await seal(key, { x: 1 })
    expect(fromBase64(a.iv).length).toBe(12)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('throws WrongPassphraseError for a different passphrase', async () => {
    const salt = randomSalt()
    const good = await deriveKey(PASS, salt, FAST)
    const bad = await deriveKey('another passphrase!', salt, FAST)
    const sealed = await seal(good, { x: 1 })
    await expect(open(bad, sealed)).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('throws WrongPassphraseError for the same passphrase with a different salt', async () => {
    const good = await deriveKey(PASS, randomSalt(), FAST)
    const other = await deriveKey(PASS, randomSalt(), FAST)
    await expect(open(other, await seal(good, 1))).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('throws WrongPassphraseError for tampered ciphertext', async () => {
    const key = await deriveKey(PASS, randomSalt(), FAST)
    const sealed = await seal(key, { x: 1 })
    const bytes = fromBase64(sealed.ciphertext)
    bytes[0] = bytes[0] ^ 0xff
    await expect(open(key, { ...sealed, ciphertext: toBase64(bytes) })).rejects.toBeInstanceOf(
      WrongPassphraseError,
    )
  })

  it('throws WrongPassphraseError for a tampered IV', async () => {
    const key = await deriveKey(PASS, randomSalt(), FAST)
    const sealed = await seal(key, { x: 1 })
    const iv = fromBase64(sealed.iv)
    iv[0] = iv[0] ^ 0xff
    await expect(open(key, { ...sealed, iv: toBase64(iv) })).rejects.toBeInstanceOf(
      WrongPassphraseError,
    )
  })

  it('binds the associated data: ciphertext sealed without it does not open', async () => {
    const key = await deriveKey(PASS, randomSalt(), FAST)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plain = new TextEncoder().encode('{"x":1}')
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain))
    await expect(open(key, { iv: toBase64(iv), ciphertext: toBase64(ct) })).rejects.toBeInstanceOf(
      WrongPassphraseError,
    )
  })

  it('throws a generic (non-passphrase) error for malformed base64', async () => {
    const key = await deriveKey(PASS, randomSalt(), FAST)
    const err = await open(key, { iv: '!!!', ciphertext: '???' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(WrongPassphraseError)
  })

  it('throws a generic error when the decrypted payload is not JSON', async () => {
    const key = await deriveKey(PASS, randomSalt(), FAST)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plain = new TextEncoder().encode('not json {')
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('nearer-vault-v1') },
        key,
        plain,
      ),
    )
    const err = await open(key, { iv: toBase64(iv), ciphertext: toBase64(ct) }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(WrongPassphraseError)
  })
})

describe('deriveKey', () => {
  it('produces a non-extractable AES-GCM key', async () => {
    const key = await deriveKey(PASS, randomSalt(), FAST)
    expect(key.extractable).toBe(false)
    expect(key.algorithm.name).toBe('AES-GCM')
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt'])
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
  })

  it('is deterministic for the same passphrase, salt and iterations', async () => {
    const salt = randomSalt()
    const a = await deriveKey(PASS, salt, FAST)
    const b = await deriveKey(PASS, salt, FAST)
    expect(await open(b, await seal(a, 'hello'))).toBe('hello')
  })

  it('normalizes the passphrase with NFKC (ligature ﬁ equals fi)', async () => {
    const salt = randomSalt()
    const ligature = await deriveKey('ﬁnd the ﬁsh now', salt, FAST)
    const plain = await deriveKey('find the fish now', salt, FAST)
    expect(await open(plain, await seal(ligature, 'ok'))).toBe('ok')
  })
})

describe('validatePassphrase', () => {
  it('accepts a reasonable passphrase', () => {
    expect(validatePassphrase('correct horse battery')).toBeNull()
    expect(validatePassphrase('0123456789')).toBeNull()
  })

  it('rejects short passphrases', () => {
    expect(validatePassphrase('')).toEqual(expect.any(String))
    expect(validatePassphrase('short')).toEqual(expect.any(String))
    expect(validatePassphrase('123456789')).toEqual(expect.any(String))
  })

  it('rejects whitespace-only passphrases', () => {
    expect(validatePassphrase(' '.repeat(20))).toEqual(expect.any(String))
    expect(validatePassphrase('\t\n  '.repeat(5))).toEqual(expect.any(String))
  })

  it('rejects a single repeated character', () => {
    expect(validatePassphrase('aaaaaaaaaaaa')).toEqual(expect.any(String))
    expect(validatePassphrase('😀'.repeat(12))).toEqual(expect.any(String))
  })

  it('counts code points, not UTF-16 units', () => {
    expect(validatePassphrase('😀😁😂🤣😃😄😅😆😉')).toEqual(expect.any(String)) // 9 emoji
    expect(validatePassphrase('😀😁😂🤣😃😄😅😆😉😊')).toBeNull() // 10 emoji
  })
})
