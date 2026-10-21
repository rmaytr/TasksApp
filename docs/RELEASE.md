# Release plan

## Recommendation: website first, app stores later (if ever)

| Option | Cost | Effort | Good for | Catches |
| --- | --- | --- | --- | --- |
| **Installable website (PWA)**, current | Free (GitHub Pages / Cloudflare Pages) | Done | Friends, college launch, fast iteration | iOS users must use Share → Add to Home Screen; no App Store discovery |
| **Google Play via TWA** ([PWABuilder](https://www.pwabuilder.com) / Bubblewrap) | $25 one-time | 1 day | Android friends who expect a store listing | Needs a custom domain + Digital Asset Links file; same codebase |
| **Microsoft Store via PWABuilder** | Free | Hours | Windows laptops | Low traffic |
| **Apple App Store via Capacitor** | $99 / year | 3–5 days | iPhone discovery, push notifications | Apple rejects thin website wrappers (guideline 4.2): add native value first (widgets, notifications, share sheet). Requires in-app account deletion (done) and a privacy "nutrition label" |

**Phase 1 (now, friends):** website + optional encrypted sync, invite-only.
**Phase 2 (campus launch, ~50–500 users):** custom domain on Cloudflare Pages (security headers,
own origin), Supabase Pro only if you hit free limits, open sign-ups with email codes.
**Phase 3 (stores):** Play Store via TWA first (cheap, same code). App Store only once there's a
native reason (reminders/notifications, home-screen widget of Today).

## How accounts are stored

- Supabase Auth keeps each user's **email** (and OAuth identity if used) in `auth.users`.
  No passwords exist: sign-in is a one-time email code.
- The `vaults` table keeps **one encrypted blob per user** plus salt, KDF settings, a version
  counter and timestamps. See [SYNC.md](SYNC.md) and the migration in `supabase/migrations/`.
- Task contents, notes and area names are **never** stored in plaintext on the server.

## Policies you need

| Document | Status | Needed for |
| --- | --- | --- |
| Privacy policy | Done: [PRIVACY.md](PRIVACY.md), in-app `/privacy.html` | Friends (trust), every app store |
| Security notes | Done: [SECURITY.md](../SECURITY.md) | Transparency |
| Terms of use | Not yet; add before a public launch (as-is, no warranty, acceptable use, termination) | Public launch, stores |
| Account deletion | Done in-app | Apple and Google requirement |
| Data safety / privacy label | Fill in from the privacy table when submitting | Play Console, App Store Connect |

This is not legal advice. Before taking money or launching publicly, have the policy and terms
reviewed, especially if you add analytics, payments or users under 13.

## Polish checklist before sharing widely

**Must**
- [ ] Set up Supabase + custom SMTP, then test sign-in → passphrase → second device (see [DEPLOY.md](DEPLOY.md))
- [ ] Custom domain (e.g. `nearer.app` or `getnearer.com`) on Cloudflare Pages: own origin, real
      security headers (`frame-ancestors`, HSTS), and Supabase redirect URLs updated
- [ ] Try it on a real iPhone (Safari → Add to Home Screen) and a real Android phone
- [ ] Ask 3 friends to import their own lists and watch them use it without help

**Should**
- [ ] Reminders: notifications for due tasks need Web Push (works for installed PWAs on iOS 16.4+);
      that's a small server function plus VAPID keys
- [ ] Start/"snooze until" dates so tasks like "apply when it opens" stay hidden until a date
- [ ] `.ics` calendar import (Canvas exports) and export of due dates
- [ ] Share an area with a friend or club board (would need per-area keys for shared encryption)
- [ ] Lighthouse pass (performance ≥ 90, accessibility ≥ 95) on the deployed URL

**Later / monetization ideas**
- Free forever locally; "Nearer Plus" ($2–3/month) for sync on more than 2 devices, themes,
  shared areas. Payments via Stripe Checkout. Needs terms, refund policy and tax handling
  (Stripe Tax or a merchant of record such as Lemon Squeezy).
- Keep end-to-end encryption as the core promise; it's a real differentiator against Notion and Todoist.
