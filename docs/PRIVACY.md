# Cairn privacy policy

_Effective October 21, 2026. Plain-language version; the same text is published in the app at `/privacy.html`._

Cairn is a small, free to-do app made by Rodion ([github.com/rmaytr](https://github.com/rmaytr)) and
shared with friends. It is not a business, shows no ads, and sells nothing.

## The short version

- **Without an account, nothing leaves your device.** Your tasks live in your browser's storage.
- **With an account, your tasks are end-to-end encrypted** with a passphrase only you know before they
  are uploaded. We can't read them, and neither can our hosting provider.
- **We keep the minimum:** your email address (to send sign-in codes) and the encrypted backup.
- **No analytics, no trackers, no cookies for advertising, no selling or sharing of data.**
- **You can delete everything** at any time from the app.
- **The assistant is off unless you turn it on.** When it's on, the text of a new task plus the titles,
  areas, due dates and priorities of your open tasks go to Anthropic's Claude API to be sorted. Notes
  and steps are never sent.

## What we collect

| Data | When | Why | Who can read it |
| --- | --- | --- | --- |
| Tasks, areas, steps, notes | Always, **on your device only** | So the app works | You, and anyone using your unlocked device |
| Email address | Only if you sign in | To send one-time sign-in codes and identify your account | The app operator (Rodion) and Supabase, our hosting provider |
| Encrypted backup (ciphertext, a random salt, a version number, timestamps) | Only if you turn on sync | To sync between your devices | Nobody can decrypt it without your passphrase |
| Task text you type, plus titles, areas, due dates and priorities of open tasks (up to 150) | Only while the assistant is on, when you add a task or tap *Plan my day* | To suggest an area, dates, priority, steps and an order | Anthropic, which processes it to answer and doesn't train on it by default ([Anthropic privacy](https://www.anthropic.com/legal/privacy)); with an invite code it also passes through the operator's proxy, whose code doesn't store or log it |
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

## The optional assistant

Settings → Assistant has three choices:

- **Off** (the default). Nothing is sent anywhere.
- **My own API key.** Your Anthropic key is stored only in this browser's IndexedDB and sent only to
  `api.anthropic.com`, directly from your browser. Usage is billed to your Anthropic account.
- **Invite code** (only if this deployment offers it). Requests go to a small proxy run by the
  operator (a Cloudflare Worker) that checks the code, limits how often it can be used, and forwards
  the request to Anthropic with the operator's key. The proxy keeps only rate-limit counters (a
  hashed code per day, a hashed IP address per hour after wrong codes); its code never stores or
  logs task text. Cloudflare, which runs it, sees ordinary request metadata.

What's sent in either case: the words you typed for the new task, today's date, your area names, and
for up to 150 open tasks their title, area, due date and priority. Notes, steps, "waiting on",
"I'll do it…" plans, finished tasks and your sync passphrase are never sent. Turning the assistant
off stops all of it immediately; Remove key deletes the stored key.

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

You can use Cairn without an account; export all your data at any time (Settings → Back up);
delete your account and backup yourself; and ask questions or request deletion by opening an issue at
[github.com/rmaytr/TasksApp](https://github.com/rmaytr/TasksApp/issues) or contacting Rodion directly.

## Children

Cairn is not directed at children under 13, and we don't knowingly collect their information.

## Changes

If this policy changes, the date at the top changes and the update is noted in the app. Because your
tasks are encrypted with your passphrase, no future change can give us access to past backups.
