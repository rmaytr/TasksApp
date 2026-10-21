import type { SupabaseClient } from '@supabase/supabase-js'
import type { Sealed } from '../sync/crypto'
import { ConflictError, VaultExistsError, type NewVault, type SyncBackend, type VaultRecord } from '../sync/engine'

/** Matches the `ciphertext` length check in the migration. */
const MAX_CIPHERTEXT = 5_000_000

function assertFits(ciphertext: string): void {
  if (ciphertext.length > MAX_CIPHERTEXT) {
    throw new Error('Your tasks are too large to back up (over 5 MB). Remove old done tasks or long notes and try again.')
  }
}

const COLUMNS = 'salt, kdf_iterations, iv, ciphertext, version, updated_at'

interface VaultRow {
  salt: string
  kdf_iterations: number
  iv: string
  ciphertext: string
  version: number
  updated_at: string
}

const toRecord = (row: VaultRow): VaultRecord => ({
  salt: row.salt,
  iterations: row.kdf_iterations,
  iv: row.iv,
  ciphertext: row.ciphertext,
  version: row.version,
  updatedAt: row.updated_at,
})

/**
 * The `vaults` table holds one encrypted row per user. Row Level Security restricts
 * every query to `auth.uid() = user_id`, so the client can never see anyone else's row.
 */
export class SupabaseBackend implements SyncBackend {
  private readonly client: SupabaseClient
  private readonly userId: string
  /** Bound into every ciphertext's authenticated data (see `vaultContext`). */
  readonly owner: string

  constructor(client: SupabaseClient, userId: string) {
    this.client = client
    this.userId = userId
    this.owner = userId
  }

  async getVault(): Promise<VaultRecord | null> {
    const { data, error } = await this.client.from('vaults').select(COLUMNS).eq('user_id', this.userId).maybeSingle()
    if (error) throw new Error(`Couldn't read your encrypted backup: ${error.message}`)
    return data ? toRecord(data as VaultRow) : null
  }

  async createVault(rec: NewVault): Promise<VaultRecord> {
    assertFits(rec.ciphertext)
    const { data, error } = await this.client
      .from('vaults')
      .insert({ user_id: this.userId, salt: rec.salt, kdf_iterations: rec.iterations, iv: rec.iv, ciphertext: rec.ciphertext })
      .select(COLUMNS)
      .single()
    if (error?.code === '23505') throw new VaultExistsError()
    if (error) throw new Error(`Couldn't create your encrypted backup: ${error.message}`)
    return toRecord(data as VaultRow)
  }

  async updateVault(sealed: Sealed, expectedVersion: number): Promise<VaultRecord> {
    assertFits(sealed.ciphertext)
    const { data, error } = await this.client
      .from('vaults')
      .update({ iv: sealed.iv, ciphertext: sealed.ciphertext, version: expectedVersion + 1 })
      .eq('user_id', this.userId)
      .eq('version', expectedVersion)
      .select(COLUMNS)
      .maybeSingle()
    if (error) throw new Error(`Couldn't save your encrypted backup: ${error.message}`)
    if (!data) throw new ConflictError()
    return toRecord(data as VaultRow)
  }

  async replaceVault(rec: NewVault): Promise<VaultRecord> {
    assertFits(rec.ciphertext)
    const current = await this.getVault()
    if (!current) return this.createVault(rec)
    const { data, error } = await this.client
      .from('vaults')
      .update({
        salt: rec.salt,
        kdf_iterations: rec.iterations,
        iv: rec.iv,
        ciphertext: rec.ciphertext,
        version: current.version + 1,
      })
      .eq('user_id', this.userId)
      .eq('version', current.version)
      .select(COLUMNS)
      .maybeSingle()
    if (error) throw new Error(`Couldn't reset your encrypted backup: ${error.message}`)
    if (!data) throw new ConflictError()
    return toRecord(data as VaultRow)
  }
}
