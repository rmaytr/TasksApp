import { describe, expect, it } from 'vitest'
import { WrongPassphraseError, seal } from '../crypto'
import type { SyncDoc } from '../doc'
import { vaultContext,
  ConflictError,
  NoVaultError,
  VaultExistsError,
  VaultFormatError,
  createVault,
  resetVault,
  syncOnce,
  unlockVault,
} from '../engine'
import { MemoryBackend } from '../fakeBackend'
import { docsEqual } from '../merge'
import { makeDoc, makeTask } from './fixtures'

const FAST = 1000
const PASS = 'correct horse battery'
const NOW = 5_000_000
const OPTS = { minIterations: 1 }

function ids(doc: SyncDoc): string[] {
  return doc.tasks.map((t) => t.id).sort()
}

describe('createVault / unlockVault', () => {
  it('creates a vault that another device can unlock with the same passphrase', async () => {
    const backend = new MemoryBackend()
    const local = makeDoc({ tasks: [makeTask('t1', { title: 'secret plan' })] })
    const { record } = await createVault(backend, PASS, local, FAST)
    expect(record.version).toBe(1)
    expect(record.iterations).toBe(FAST)

    const unlocked = await unlockVault(backend, PASS, OPTS)
    expect(docsEqual(unlocked.doc, local)).toBe(true)
    expect(unlocked.record.version).toBe(1)
  })

  it('stores only ciphertext on the backend', async () => {
    const backend = new MemoryBackend()
    await createVault(backend, PASS, makeDoc({ tasks: [makeTask('t1', { title: 'secret plan' })] }), FAST)
    expect(JSON.stringify(await backend.getVault())).not.toContain('secret plan')
  })

  it('returns a non-extractable key', async () => {
    const { key } = await createVault(new MemoryBackend(), PASS, makeDoc(), FAST)
    expect(key.extractable).toBe(false)
  })

  it('throws VaultExistsError when a vault already exists', async () => {
    const backend = new MemoryBackend()
    await createVault(backend, PASS, makeDoc(), FAST)
    await expect(createVault(backend, PASS, makeDoc(), FAST)).rejects.toBeInstanceOf(VaultExistsError)
  })

  it('throws NoVaultError when unlocking without a vault', async () => {
    await expect(unlockVault(new MemoryBackend(), PASS, OPTS)).rejects.toBeInstanceOf(NoVaultError)
  })

  it('throws WrongPassphraseError for a wrong passphrase', async () => {
    const backend = new MemoryBackend()
    await createVault(backend, PASS, makeDoc(), FAST)
    await expect(unlockVault(backend, 'not the passphrase', OPTS)).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('refuses a vault whose KDF cost is below the safety floor (downgrade protection)', async () => {
    const backend = new MemoryBackend()
    await createVault(backend, PASS, makeDoc(), FAST)
    await expect(unlockVault(backend, PASS)).rejects.toBeInstanceOf(VaultFormatError)
  })

  it('refuses a vault with an absurd iteration count', async () => {
    const backend = new MemoryBackend()
    await createVault(backend, PASS, makeDoc(), FAST)
    backend.tamper({ iterations: 2_000_000_000 })
    await expect(unlockVault(backend, PASS, OPTS)).rejects.toBeInstanceOf(VaultFormatError)
  })

  it('refuses a vault written in an unknown document format', async () => {
    const backend = new MemoryBackend()
    const { key } = await createVault(backend, PASS, makeDoc(), FAST)
    backend.writeDirect(await seal(key, { v: 2, areas: [], tasks: [], tombstones: [] }, vaultContext(undefined, 2)))
    await expect(unlockVault(backend, PASS, OPTS)).rejects.toBeInstanceOf(VaultFormatError)
  })
})

describe('syncOnce', () => {
  it('converges two devices that edit different tasks', async () => {
    const backend = new MemoryBackend()
    const base = makeDoc({
      tasks: [makeTask('t1', { updatedAt: 1 }), makeTask('t2', { updatedAt: 1 })],
    })
    const a = await createVault(backend, PASS, base, FAST)
    const b = await unlockVault(backend, PASS, OPTS)

    let docA: SyncDoc = makeDoc({
      tasks: [{ ...base.tasks[0], title: 'edited on A', updatedAt: 100 }, base.tasks[1], makeTask('a-new', { updatedAt: 110 })],
    })
    let docB: SyncDoc = makeDoc({
      tasks: [base.tasks[0], { ...base.tasks[1], title: 'edited on B', updatedAt: 200 }],
      tombstones: [],
    })

    const r1 = await syncOnce(backend, a.key, docA, NOW)
    docA = r1.doc
    const r2 = await syncOnce(backend, b.key, docB, NOW)
    docB = r2.doc
    const r3 = await syncOnce(backend, a.key, docA, NOW)
    docA = r3.doc

    expect(docsEqual(docA, docB)).toBe(true)
    expect(docA.tasks.find((t) => t.id === 't1')?.title).toBe('edited on A')
    expect(docA.tasks.find((t) => t.id === 't2')?.title).toBe('edited on B')
    expect(ids(docA)).toEqual(['a-new', 't1', 't2'])
    expect(r2.changedLocal).toBe(true)
    expect(r3.changedLocal).toBe(true)
  })

  it('propagates a deletion to the other device', async () => {
    const backend = new MemoryBackend()
    const base = makeDoc({ tasks: [makeTask('t1', { updatedAt: 1 })] })
    const a = await createVault(backend, PASS, base, FAST)
    const b = await unlockVault(backend, PASS, OPTS)

    const afterDelete = makeDoc({ tasks: [], tombstones: [{ id: 't1', kind: 'task', at: 50 }] })
    await syncOnce(backend, a.key, afterDelete, NOW)
    const result = await syncOnce(backend, b.key, b.doc, NOW)

    expect(result.doc.tasks).toEqual([])
    expect(result.changedLocal).toBe(true)
  })

  it('reports pushed without changedLocal when only the local side is ahead', async () => {
    const backend = new MemoryBackend()
    const { key } = await createVault(backend, PASS, makeDoc(), FAST)
    const local = makeDoc({ tasks: [makeTask('t1')] })
    const result = await syncOnce(backend, key, local, NOW)
    expect(result.pushed).toBe(true)
    expect(result.changedLocal).toBe(false)
    expect(result.record.version).toBe(2)
  })

  it('does not push when nothing changed', async () => {
    const backend = new MemoryBackend()
    const doc = makeDoc({ tasks: [makeTask('t1')] })
    const { key } = await createVault(backend, PASS, doc, FAST)
    const result = await syncOnce(backend, key, doc, NOW)
    expect(result.pushed).toBe(false)
    expect(result.changedLocal).toBe(false)
    expect(result.record.version).toBe(1)
    expect((await backend.getVault())?.version).toBe(1)
  })

  it('does not push when the devices only differ in item order', async () => {
    const backend = new MemoryBackend()
    const tasks = [makeTask('t1'), makeTask('t2')]
    const { key } = await createVault(backend, PASS, makeDoc({ tasks }), FAST)
    const result = await syncOnce(backend, key, makeDoc({ tasks: [...tasks].reverse() }), NOW)
    expect(result.pushed).toBe(false)
    expect(result.record.version).toBe(1)
  })

  it('retries after a concurrent write and converges', async () => {
    const backend = new MemoryBackend()
    const a = await createVault(backend, PASS, makeDoc(), FAST)
    const docB = makeDoc({ tasks: [makeTask('from-b', { updatedAt: 300 })] })
    const sealedB = await seal(a.key, docB, vaultContext(undefined, 2))
    backend.beforeUpdate = () => {
      backend.beforeUpdate = undefined
      backend.writeDirect(sealedB)
    }

    const docA = makeDoc({ tasks: [makeTask('from-a', { updatedAt: 200 })] })
    const result = await syncOnce(backend, a.key, docA, NOW)

    expect(result.pushed).toBe(true)
    expect(ids(result.doc)).toEqual(['from-a', 'from-b'])
    expect(result.record.version).toBe(3)
    const final = await unlockVault(backend, PASS, OPTS)
    expect(ids(final.doc)).toEqual(['from-a', 'from-b'])
  })

  it('rethrows ConflictError after exhausting retries', async () => {
    const backend = new MemoryBackend()
    const { key } = await createVault(backend, PASS, makeDoc(), FAST)
    // Another device writes before every attempt; each write is sealed for the version it creates.
    const noiseDoc = makeDoc({ tasks: [makeTask('noise', { updatedAt: 1 })] })
    const noise = await Promise.all([2, 3, 4].map((v) => seal(key, noiseDoc, vaultContext(undefined, v))))
    let attempts = 0
    backend.beforeUpdate = () => {
      backend.writeDirect(noise[attempts])
      attempts += 1
    }

    const local = makeDoc({ tasks: [makeTask('mine', { updatedAt: 9 })] })
    await expect(syncOnce(backend, key, local, NOW, 2)).rejects.toBeInstanceOf(ConflictError)
    expect(attempts).toBe(3)
  })

  it('throws NoVaultError when the vault does not exist', async () => {
    const { key } = await createVault(new MemoryBackend(), PASS, makeDoc(), FAST)
    await expect(syncOnce(new MemoryBackend(), key, makeDoc(), NOW)).rejects.toBeInstanceOf(NoVaultError)
  })

  it('throws WrongPassphraseError when the vault was re-keyed elsewhere', async () => {
    const backend = new MemoryBackend()
    const old = await createVault(backend, PASS, makeDoc(), FAST)
    await resetVault(backend, 'a brand new passphrase', makeDoc(), FAST)
    await expect(syncOnce(backend, old.key, makeDoc(), NOW)).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('never overwrites a vault written in an unknown format', async () => {
    const backend = new MemoryBackend()
    const { key } = await createVault(backend, PASS, makeDoc(), FAST)
    backend.writeDirect(await seal(key, { v: 2, areas: [], tasks: [], tombstones: [] }, vaultContext(undefined, 2)))
    const versionBefore = (await backend.getVault())?.version
    await expect(syncOnce(backend, key, makeDoc({ tasks: [makeTask('t1')] }), NOW)).rejects.toBeInstanceOf(
      VaultFormatError,
    )
    expect((await backend.getVault())?.version).toBe(versionBefore)
  })

  it('rejects a corrupt remote payload instead of treating it as empty', async () => {
    const backend = new MemoryBackend()
    const { key } = await createVault(backend, PASS, makeDoc(), FAST)
    backend.writeDirect(await seal(key, 'just a string', vaultContext(undefined, 2)))
    await expect(syncOnce(backend, key, makeDoc(), NOW)).rejects.toBeInstanceOf(VaultFormatError)
  })
})

describe('resetVault', () => {
  it('replaces the vault with a new salt and passphrase', async () => {
    const backend = new MemoryBackend()
    const first = await createVault(backend, PASS, makeDoc(), FAST)
    const local = makeDoc({ tasks: [makeTask('kept')] })
    const second = await resetVault(backend, 'a brand new passphrase', local, FAST)

    expect(second.record.salt).not.toBe(first.record.salt)
    await expect(unlockVault(backend, PASS, OPTS)).rejects.toBeInstanceOf(WrongPassphraseError)
    const unlocked = await unlockVault(backend, 'a brand new passphrase', OPTS)
    expect(ids(unlocked.doc)).toEqual(['kept'])
  })
})

describe('MemoryBackend', () => {
  it('increments the version on every update and rejects stale versions', async () => {
    const backend = new MemoryBackend()
    const { key, record } = await createVault(backend, PASS, makeDoc(), FAST)
    const sealed = await seal(key, makeDoc())
    const next = await backend.updateVault(sealed, record.version)
    expect(next.version).toBe(2)
    await expect(backend.updateVault(sealed, record.version)).rejects.toBeInstanceOf(ConflictError)
  })

  it('returns copies so callers cannot mutate stored state', async () => {
    const backend = new MemoryBackend()
    await createVault(backend, PASS, makeDoc(), FAST)
    const rec = await backend.getVault()
    if (rec) rec.version = 99
    expect((await backend.getVault())?.version).toBe(1)
  })

  it('rejects updates when there is no vault', async () => {
    const backend = new MemoryBackend()
    await expect(backend.updateVault({ iv: '', ciphertext: '' }, 1)).rejects.toBeInstanceOf(NoVaultError)
  })
})

describe('rollback and swap protection', () => {
  it('refuses a vault older than the version this device has seen', async () => {
    const backend = new MemoryBackend()
    const { key, record } = await createVault(backend, PASS, makeDoc(), FAST)
    await expect(syncOnce(backend, key, makeDoc(), NOW, 0, record.version + 1)).rejects.toBeInstanceOf(VaultFormatError)
  })

  it('rejects an old ciphertext relabelled with a newer version', async () => {
    const backend = new MemoryBackend()
    const { key } = await createVault(backend, PASS, makeDoc(), FAST)
    const v1 = await backend.getVault()
    await syncOnce(backend, key, makeDoc({ tasks: [makeTask('new')] }), NOW)
    backend.tamper({ iv: v1?.iv, ciphertext: v1?.ciphertext })
    await expect(syncOnce(backend, key, makeDoc(), NOW)).rejects.toBeInstanceOf(WrongPassphraseError)
  })
})
