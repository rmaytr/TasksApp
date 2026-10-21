# Nearer privacy policy

_Effective October 21, 2026. Plain-language version; the same text is published in the app at `/privacy.html`._

Nearer is a small, free to-do app made by Rodion ([github.com/rmaytr](https://github.com/rmaytr)) and
shared with friends. It is not a business, shows no ads, and sells nothing.

## The short version

- **Without an account, nothing leaves your device.** Your tasks live in your browser's storage.
- **With an account, your tasks are end-to-end encrypted** with a passphrase only you know before they
  are uploaded. We can't read them, and neither can our hosting provider.
- **We keep the minimum:** your email address (to send sign-in codes) and the encrypted backup.
- **No analytics, no trackers, no cookies for advertising, no selling or sharing of data.**
- **You can delete everything** at any time from the app.

## What we collect

| Data | When | Why | Who can read it |
| --- | --- | --- | --- |
| Tasks, areas, steps, notes | Always, **on your device only** | So the app works | You, and anyone using your unlocked device |
| Email address | Only if you sign in | To send one-time sign-in codes and identify your account | The app operator (Rodion) and Supabase, our hosting provider |
| Encrypted backup (ciphertext, a random salt, a version number, timestamps) | Only if you turn on sync | To sync between your devices | Nobody can decrypt it without your passphrase |
| Sign-in metadata (time of sign-in, IP address in server logs) | Only if you sign in | Security and abuse prevention, kept by Supabase | The app operator and Supabase, for up to the provider's log retention period |

We never receive your **passphrase**, your **encryption key**, or the **contents of your tasks**.

## How your data is protected

- **On your device:** stored in IndexedDB, protected by your browser and operating system. The
  encryption key is stored as a non-extractable key that page scripts can use but not read.
- **In transit:** HTTPS (TLS) only.
- **On the server:** AES-GCM-256 encryption performed in your browser, with a key derived from your
  passphrase (PBKDF2-SHA-256, 600,000 iterations, random salt). Database rules (Row Level Security)
  let each account read and write only its own row. The provider also encrypts data at rest.

If you forget your passphrase, **we cannot recover your backup**. Your tasks remain on any device that
still has them, and you can create a new backup from there.

## Where data is stored

The encrypted backup and your email are stored with [Supabase](https://supabase.com/privacy) (a hosted
Postgres database) in the region chosen when the project was created. The app itself is static files
served by GitHub Pages, which, like any web host, may log IP addresses of visitors
([GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)).

## How long we keep it

- Encrypted backups and your email: until you delete your account.
- Deleting your account (Settings → Sync across devices → Delete account) removes your email and
  backup from the database immediately. Provider backups age out on their own schedule.
- Local data: until you clear it (Settings → Delete all tasks, or "Sign out and clear this device"),
  or clear your browser's site data.

## Your choices and rights

You can use Nearer without an account; export all your data at any time (Settings → Back up);
delete your account and backup yourself; and ask questions or request deletion by opening an issue at
[github.com/rmaytr/TasksApp](https://github.com/rmaytr/TasksApp/issues) or contacting Rodion directly.

## Children

Nearer is not directed at children under 13, and we don't knowingly collect their information.

## Changes

If this policy changes, the date at the top changes and the update is noted in the app. Because your
tasks are encrypted with your passphrase, no future change can give us access to past backups.
