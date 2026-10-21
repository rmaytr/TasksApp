import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from '../ids'

describe('newId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a non-empty string', () => {
    expect(newId()).toMatch(/^[\w-]{8,}$/)
  })

  it('returns unique ids', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newId()))
    expect(ids.size).toBe(2000)
  })

  it('uses crypto.randomUUID when available', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-uuid' })
    expect(newId()).toBe('fixed-uuid')
  })

  it('falls back to getRandomValues when randomUUID is missing', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (a: Uint8Array) => a.fill(7),
    })
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('falls back to Math.random when crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined)
    const a = newId()
    const b = newId()
    expect(a).toMatch(/^[\w-]{8,}$/)
    expect(a).not.toBe(b)
  })
})
