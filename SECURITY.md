# Security

## Reporting a problem

Please open a private security advisory on GitHub
(<https://github.com/rmaytr/TasksApp/security/advisories/new>) instead of a public issue.

## Design summary

- **Local-first.** All task data lives in the browser (IndexedDB). Without sync, the app makes no
  network requests besides loading itself.
- **End-to-end encryption for sync.** AES-GCM-256 with a key derived in the browser from the user's
  passphrase (PBKDF2-SHA-256, 600k iterations, 16-byte random salt, 96-bit random IV per write,
  fixed additional authenticated data). The key is stored as a non-extractable `CryptoKey`.
  The client refuses vaults whose KDF settings are weaker than 100k iterations, so a hostile server
  cannot downgrade them.
- **Server isolation.** Postgres Row Level Security limits every row to `auth.uid() = user_id`;
  `anon` has no grants; a trigger forces versions to increase by exactly one and prevents changing
  the owner. Account deletion is self-service via a `security definer` function scoped to the caller.
- **Passwordless auth.** One-time email codes or OAuth through Supabase Auth; the app never handles
  passwords. Sign-ups can be disabled for invite-only use.
- **Browser hardening.** Production builds ship a Content Security Policy (`default-src 'self'`,
  `object-src 'none'`, `connect-src` limited to the configured Supabase origin, hashed inline
  script). No `dangerouslySetInnerHTML`, no `eval`. Imported files are size- and line-capped and
  validated with Zod.

## Known limits

- Anyone with your unlocked device can read your tasks (as with any app).
- GitHub Pages serves all of an account's project sites from one origin (`rmaytr.github.io`), so
  other sites under that account share the browser storage origin. Move to a custom domain before
  any public launch.
- A `<meta>` CSP cannot set `frame-ancestors`; add it as a header once hosting supports headers
  (e.g. Cloudflare Pages).
- If you forget your passphrase, the encrypted backup cannot be recovered by anyone.
