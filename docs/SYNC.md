# Accounts & end-to-end encrypted sync

Nearer stays local-first: it works fully without an account. An account only adds
**backup and sync across your devices**. Sync is end-to-end encrypted, so the server
(and whoever runs it) stores ciphertext it cannot read.

## Threat model (friends-scale)

| Who | Can they read your tasks? |
| --- | --- |
| Other users of the same deployment | No — Postgres Row Level Security limits every row to its owner, and the content is encrypted anyway |
| The app operator (Supabase project owner) | No — only ciphertext, a random salt and timestamps are stored; the key never leaves your devices |
| Supabase / cloud provider | No — same as above; data is also encrypted at rest by the provider |
| Someone with your unlocked device | Yes — the decrypted copy lives in the browser's IndexedDB, like any app |
| Someone who learns your email | They can request a sign-in code but cannot read data without your passphrase |

What the server *does* see: your email address (for sign-in), when you last synced, and the
approximate size of your encrypted data.

## How it works

```
 passphrase ──PBKDF2-SHA256 (600k, per-user random salt)──► AES-GCM-256 key (non-extractable)
                                                                 │
 { areas, tasks, tombstones } ──JSON──► AES-GCM(key, random 96-bit IV) ──► ciphertext ──► Supabase `vaults` row
```

1. **Sign in** with a one-time code sent to your email (Supabase Auth, passwordless). No
   password is ever created or stored by Nearer.
2. **First device:** choose an encryption passphrase. A random salt is generated, the key is
   derived in the browser (WebCrypto), and your data is encrypted and uploaded.
3. **Other devices:** sign in, type the same passphrase, and your data is decrypted and merged
   with anything already on that device.
4. The derived key is stored on each device as a **non-extractable** `CryptoKey` in IndexedDB,
   so you don't retype the passphrase. Any sign-out deletes it.
5. Each ciphertext is authenticated together with `owner id + version`, and every device remembers
   the newest version it has seen, so the server can't hand you another user's row or an old copy.
6. **Forgotten passphrase = encrypted backup is unrecoverable.** Your local copy still works;
   you can reset the vault (upload a fresh one with a new passphrase).

### Merging

The vault holds one document `{ areas, tasks, tombstones }`. Each task and area carries
`updatedAt`; deletions leave a tombstone `{ id, kind, at }` (kept 90 days). Merge is
per-item last-writer-wins: the newer `updatedAt` wins, a tombstone newer than the item
removes it, and an item edited after its tombstone comes back. Writes use optimistic
concurrency (`version` column): if another device wrote first, the client pulls, merges and
retries.

## Database (supabase/migrations)

- `public.vaults` — one row per user: `user_id`, `salt`, `kdf_iterations`, `iv`,
  `ciphertext`, `version`, `updated_at`. RLS: a user can only select/insert/update/delete
  their own row. Ciphertext is capped at 5 MB.
- `public.delete_my_account()` — `security definer` function that deletes the caller's auth
  user; the vault row cascades. Exposed in Settings as "Delete account and cloud data".

## Setup (operator)

See [DEPLOY.md](DEPLOY.md).
