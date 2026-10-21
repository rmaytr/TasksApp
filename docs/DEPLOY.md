# Deploying Nearer

Nearer is two independent pieces:

1. **The app**: static files on GitHub Pages at <https://rmaytr.github.io/TasksApp/>. This works
   on its own: everyone's tasks stay in their own browser and nobody can see anyone else's.
2. **Sync (optional)**: a free Supabase project that stores each user's *encrypted* backup.
   Add it when you want friends to sign in and sync between devices.

## 1. The app (GitHub Pages)

Already set up: every push to `main` runs tests, builds with `VITE_BASE=/TasksApp/` and deploys.
Pages is set to **Source: GitHub Actions** (repo Settings → Pages).

## 2. Sync (Supabase), about 15 minutes

> You need to do these steps yourself. They involve creating an account and handling project keys.

1. **Create a project** at <https://supabase.com> (Free plan). Pick the region nearest your friends.
   Note: free projects pause after about a week with no activity; open the dashboard to wake one up.
2. **Create the table and rules:** open *SQL Editor*, paste
   [`supabase/migrations/20261021000000_vaults.sql`](../supabase/migrations/20261021000000_vaults.sql)
   and run it. Then open *Table Editor → vaults* and confirm it shows **RLS enabled**.
3. **Sign-in by email code:**
   - *Authentication → Sign In / Providers → Email*: enabled. "Confirm email" can stay on.
   - *Authentication → Emails → Templates → Magic Link*: make sure the body includes the code,
     e.g. `Your Nearer code is {{ .Token }}` (keep the `{{ .ConfirmationURL }}` link too).
   - **Email delivery:** Supabase's built-in mailer only sends to your own team's addresses and is
     heavily rate-limited. To email friends, set up custom SMTP under *Authentication → Emails → SMTP
     Settings*. [Resend](https://resend.com) has a free tier: verify a sender domain (or use their
     test domain for yourself) and paste its SMTP host, user and password there.
4. **URLs:** under *Authentication → URL Configuration*, set Site URL to
   `https://rmaytr.github.io/TasksApp/`, and add `http://localhost:5173/` and `http://localhost:5174/`
   to Redirect URLs for local testing.
5. **Keep it friends-only (recommended):** under *Authentication → Sign In / Providers*, turn off
   **Allow new users to sign up**. Then invite each friend from *Authentication → Users → Invite user*.
   Anyone else who tries gets "Nearer is invite-only for now".
6. **Connect the app:** in *Project Settings → API*, copy the **Project URL** and the **anon / publishable
   key**. The publishable key is designed to be public: RLS is what protects data. **Never** use the
   `service_role` / secret key in the app. In GitHub go to *repo Settings → Secrets and variables →
   Actions → Variables* and add:
   - `VITE_SUPABASE_URL` = `https://<project>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the anon/publishable key
   - optional `VITE_AUTH_PROVIDERS` = `github` (only after enabling GitHub under Providers)
7. Re-run the **Deploy to GitHub Pages** workflow (Actions tab → Run workflow). A "Back up & sync"
   button now appears in the sidebar.

### Local development with sync

Create `TasksApp/.env.local` (git-ignored) with the same two `VITE_SUPABASE_*` values, then
`npm run dev`.

## Checklist before sharing with friends

- [ ] RLS shows enabled on `vaults`; `anon` has no grants (the migration revokes them)
- [ ] Sign-ups off; friends invited individually
- [ ] Custom SMTP configured and a test code received
- [ ] You signed in on two devices, created a passphrase on one, unlocked on the other, and saw edits sync
- [ ] "Delete account" works on a throwaway account
- [ ] Privacy page reachable at `/TasksApp/privacy.html`
