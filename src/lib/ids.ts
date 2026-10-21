const HEX = '0123456789abcdef'

function uuidFromBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes)
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40 // version 4
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(b, (n) => HEX[n >> 4]! + HEX[n & 15]!).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  const cryptoApi: Crypto | undefined = globalThis.crypto
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes)
    return bytes
  }
  return bytes.map(() => Math.floor(Math.random() * 256))
}

/** A unique id: crypto.randomUUID() when available, else a v4-shaped fallback. */
export function newId(): string {
  const cryptoApi: Crypto | undefined = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  return uuidFromBytes(randomBytes(16))
}
