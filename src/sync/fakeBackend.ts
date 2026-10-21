import type { Sealed } from './crypto'
import {
  ConflictError,
  NoVaultError,
  VaultExistsError,
  type NewVault,
  type SyncBackend,
  type VaultRecord,
} from './engine'

/**
 * In-memory `SyncBackend` for tests (and later e2e). Share one instance between several
 * simulated devices. Every operation mutates state synchronously before its promise
 * resolves, so a `beforeUpdate` hook can inject a concurrent write deterministically.
 */
export class MemoryBackend implements SyncBackend {
  private current: VaultRecord | null = null

  /** Called at the start of every `updateVault`, before the version check. */
  beforeUpdate?: () => void

  async getVault(): Promise<VaultRecord | null> {
    return this.current === null ? null : { ...this.current }
  }

  async createVault(rec: NewVault): Promise<VaultRecord> {
    if (this.current !== null) throw new VaultExistsError()
    return this.store({ ...rec, version: 1 })
  }

  async updateVault(sealed: Sealed, expectedVersion: number): Promise<VaultRecord> {
    this.beforeUpdate?.()
    if (this.current === null) throw new NoVaultError()
    if (this.current.version !== expectedVersion) throw new ConflictError()
    return this.writeDirect(sealed)
  }

  async replaceVault(rec: NewVault): Promise<VaultRecord> {
    return this.store({ ...rec, version: (this.current?.version ?? 0) + 1 })
  }

  /** Test helper: another device writes `sealed` right now (bumps the version, no checks). */
  writeDirect(sealed: Sealed): VaultRecord {
    if (this.current === null) throw new NoVaultError()
    return this.store({ ...this.current, ...sealed, version: this.current.version + 1 })
  }

  /** Test helper: overwrite arbitrary stored fields, e.g. to simulate a hostile server. */
  tamper(patch: Partial<VaultRecord>): void {
    if (this.current === null) throw new NoVaultError()
    this.current = { ...this.current, ...patch }
  }

  private store(rec: Omit<VaultRecord, 'updatedAt'>): VaultRecord {
    this.current = { ...rec, updatedAt: new Date().toISOString() }
    return { ...this.current }
  }
}
