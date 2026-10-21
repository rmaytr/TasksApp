# Security

## Reporting a problem

Please open a private security advisory on GitHub
(<https://github.com/rmaytr/TasksApp/security/advisories/new>) instead of a public issue.

## Design summary

- **Local-first.** All task data lives in the browser (IndexedDB). Without sync or the assistant (both
  opt-in), the app makes no network requests besides loading itself.
- **End-to-end encryption for sync.** AES-GCM-256 with a key derived in the browser from the user's
  passphrase (PBKDF2-SHA-256, 600k iterations, 16-byte random salt, 96-bit random IV per write,
  fixed additional authenticated data). The key is stored as a non-extractable `CryptoKey`.
  The client refuses vaults whose KDF settings are outside 100k–2M iterations. Each ciphertext's
  authenticated data binds it to its owner and version, and each device remembers the highest version
  it has synced, so a server can't swap rows between users or quietly roll a vault back.
  Passphrases need 12+ characters, enough variety, and no common passwords.
- **Server isolation.** Postgres Row Level Security limits every row to `auth.uid() = user_id`;
  `anon` has no grants; a trigger forces versions to increase by exactly one and prevents changing
  the owner. Account deletion is self-service via a `security definer` function scoped to the caller.
- **Passwordless auth.** One-time email codes or OAuth through Supabase Auth; the app never handles
  passwords. Invite-only by default (the sign-in form never creates accounts). Any sign-out, including
  from another tab or a revoked session, deletes the device's vault key; a different account signing
  in on the same device first clears the previous account's local tasks. Builds refuse to ship a
  service-role/secret key.
- **Optional assistant, off by default.** It sends only the new task's text plus title, area, due
  date and priority of open tasks; never notes, steps or the sync passphrase. A personal Anthropic
  key is kept in IndexedDB and sent only to `api.anthropic.com`. The invite-code proxy
  (`worker/`) checks codes in constant time, enforces an origin allowlist, a 64 KB body cap and a
  per-code daily limit, validates input and output with Zod, and never logs request bodies. Model
  output is treated as untrusted: it is schema-checked, clipped, and rendered as plain text.
- **Browser hardening.** Production builds ship a Content Security Policy (`default-src 'self'`,
  `object-src 'none'`, `connect-src` limited to the configured Supabase origin, `api.anthropic.com` and the optional assistant proxy, hashed inline
  script). No `dangerouslySetInnerHTML`, no `eval`. Imported files are size- and line-capped and
  validated with Zod.

## Known limits

- A personal API key stored for the assistant can be read by any script running on the app's origin.
  On a shared origin like `github.io`, prefer the invite-code proxy, or move the app to its own origin.

- Anyone with your unlocked device can read your tasks (as with any app).
- GitHub Pages serves all of an account's project sites from one origin (`rmaytr.github.io`), so
  other sites under that account share the browser storage origin. **Sync must run on its own origin**
  (Cloudflare Pages `*.pages.dev` or a custom domain); see docs/DEPLOY.md.
- PBKDF2 is the only KDF WebCrypto offers natively; a weak passphrase can still be brute-forced
  offline by whoever holds the ciphertext. Argon2id (WASM) is a possible upgrade.
- A `<meta>` CSP cannot set `frame-ancestors`; add it as a header once hosting supports headers
  (e.g. Cloudflare Pages).
- If you forget your passphrase, the encrypted backup cannot be recovered by anyone.
