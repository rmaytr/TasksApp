import { useState, type FormEvent, type ReactNode } from 'react'
import { sendSignInCode, signInWithProvider, verifySignInCode } from '../cloud/client'
import { cloudConfig } from '../cloud/config'
import {
  connect,
  createEncryptedBackup,
  deleteCloudAccount,
  messageOf,
  resetEncryptedBackup,
  signOutCloud,
  syncNow,
  unlockEncryptedBackup,
} from '../cloud/controller'
import { validatePassphrase } from '../sync/crypto'
import { useStore } from '../store/useStore'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import './AccountDialog.css'

export function AccountDialog() {
  const open = useStore((s) => s.accountOpen)
  const setOpen = useStore((s) => s.setAccountOpen)
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Sync across devices">
      {open && <AccountBody />}
    </Dialog>
  )
}

function AccountBody() {
  const sync = useStore((s) => s.sync)
  if (sync.status === 'signed-out' || sync.status === 'off') return <SignIn />
  if (sync.status === 'locked' && sync.vault === 'missing') return <CreateVault />
  if (sync.status === 'locked') return <UnlockVault />
  return <Connected />
}

/** Runs an async action with a busy flag and a user-facing error. */
function useAction(): { busy: boolean; error: string | null; run: (fn: () => Promise<void>) => Promise<boolean> } {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (e) {
      setError(messageOf(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="account__error" role="alert">
      {error}
    </p>
  ) : null
}

function Explainer({ children }: { children: ReactNode }) {
  return <p className="account__explain">{children}</p>
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const { busy, error, run } = useAction()

  const send = (e: FormEvent): void => {
    e.preventDefault()
    void run(async () => {
      await sendSignInCode(email.trim())
      setSent(true)
    })
  }
  const verify = (e: FormEvent): void => {
    e.preventDefault()
    void run(async () => {
      await verifySignInCode(email.trim(), code)
      await connect()
    })
  }

  return (
    <div className="dialog__body account">
      <Explainer>
        Cairn works without an account. Signing in adds an <strong>end-to-end encrypted</strong> backup that syncs
        your tasks between your phone and laptop. Your tasks are encrypted on this device with a passphrase only you
        know. The server, and whoever runs it, sees only scrambled data.
      </Explainer>
      {!sent ? (
        <form className="account__form" onSubmit={send}>
          <label>
            <span>Email</span>
            <input
              className="field"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
            />
          </label>
          <button type="submit" className="btn btn--primary" disabled={busy || !email.includes('@')}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </button>
          <p className="account__fine">No password. We only use your email to send sign-in codes.</p>
        </form>
      ) : (
        <form className="account__form" onSubmit={verify}>
          <p>
            We sent a code to <strong>{email}</strong>. Type it here, or open the link in the email on this device.
          </p>
          <label>
            <span>Code</span>
            <input
              className="field account__code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <div className="account__row">
            <button type="submit" className="btn btn--primary" disabled={busy || code.length < 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setSent(false)}>
              Use a different email
            </button>
          </div>
        </form>
      )}
      {cloudConfig.oauthProviders.length > 0 && (
        <div className="account__oauth">
          {cloudConfig.oauthProviders.map((p) => (
            <button key={p} type="button" className="btn" disabled={busy} onClick={() => void run(() => signInWithProvider(p))}>
              Continue with {p === 'github' ? 'GitHub' : 'Google'}
            </button>
          ))}
        </div>
      )}
      <ErrorLine error={error} />
      <PrivacyLink />
    </div>
  )
}

function PassphraseFields({ onChange }: { onChange: (value: string | null) => void }) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const problem = pass ? validatePassphrase(pass) : null
  const mismatch = confirm.length > 0 && confirm !== pass
  const update = (p: string, c: string): void => onChange(p && !validatePassphrase(p) && p === c ? p : null)

  return (
    <>
      <label>
        <span>Passphrase</span>
        <input
          className="field"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={pass}
          onChange={(e) => {
            setPass(e.target.value)
            update(e.target.value, confirm)
          }}
          aria-describedby="pass-hint"
        />
      </label>
      <label>
        <span>Type it again</span>
        <input
          className="field"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            update(pass, e.target.value)
          }}
          aria-invalid={mismatch}
        />
      </label>
      <label className="account__check">
        <input type="checkbox" className="check check--square" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show passphrase
      </label>
      <p id="pass-hint" className={`account__fine${problem || mismatch ? ' is-bad' : ''}`}>
        {problem ?? (mismatch ? 'The two entries don’t match.' : 'At least 12 characters. Three or four unrelated words are easy to remember and hard to guess.')}
      </p>
    </>
  )
}

function CreateVault() {
  const [pass, setPass] = useState<string | null>(null)
  const [understood, setUnderstood] = useState(false)
  const { busy, error, run } = useAction()
  const email = useStore((s) => s.sync.email)
  return (
    <form
      className="dialog__body account account__form"
      onSubmit={(e) => {
        e.preventDefault()
        if (pass) void run(() => createEncryptedBackup(pass))
      }}
    >
      <p className="account__who">Signed in as {email}</p>
      <Explainer>
        Choose an encryption passphrase. It locks your backup so only your devices can read it. It's different from
        your email and never leaves this device.
      </Explainer>
      <PassphraseFields onChange={setPass} />
      <label className="account__check account__warn">
        <input type="checkbox" className="check check--square" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        I understand that if I forget this passphrase, nobody can recover my backup. My tasks on this device stay
        safe.
      </label>
      <button type="submit" className="btn btn--primary" disabled={busy || !pass || !understood}>
        <Icon name="lock" size={16} /> {busy ? 'Encrypting…' : 'Encrypt and back up'}
      </button>
      <ErrorLine error={error} />
      <SignOutLinks />
    </form>
  )
}

function UnlockVault() {
  const [pass, setPass] = useState('')
  const [resetting, setResetting] = useState(false)
  const { busy, error, run } = useAction()
  const sync = useStore((s) => s.sync)
  if (resetting) return <ResetVault onCancel={() => setResetting(false)} />
  return (
    <form
      className="dialog__body account account__form"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() => unlockEncryptedBackup(pass))
      }}
    >
      <p className="account__who">Signed in as {sync.email}</p>
      <Explainer>
        {sync.message ?? 'Enter your encryption passphrase to unlock your backup on this device. Tasks already here will be merged in.'}
      </Explainer>
      <label>
        <span>Passphrase</span>
        <input className="field" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus data-autofocus />
      </label>
      <button type="submit" className="btn btn--primary" disabled={busy || pass.length === 0}>
        <Icon name="lock" size={16} /> {busy ? 'Unlocking…' : 'Unlock'}
      </button>
      <ErrorLine error={error} />
      <button type="button" className="btn btn--ghost account__forgot" onClick={() => setResetting(true)}>
        Forgot your passphrase?
      </button>
      <SignOutLinks />
    </form>
  )
}

function ResetVault({ onCancel }: { onCancel: () => void }) {
  const [pass, setPass] = useState<string | null>(null)
  const [understood, setUnderstood] = useState(false)
  const { busy, error, run } = useAction()
  return (
    <form
      className="dialog__body account account__form"
      onSubmit={(e) => {
        e.preventDefault()
        if (pass) void run(() => resetEncryptedBackup(pass))
      }}
    >
      <Explainer>
        Without the old passphrase the cloud copy can't be opened. You can replace it with the tasks on
        <strong> this device</strong>, locked with a new passphrase. Changes that only exist on your other devices will be
        lost; sign in there afterwards with the new passphrase.
      </Explainer>
      <PassphraseFields onChange={setPass} />
      <label className="account__check account__warn">
        <input type="checkbox" className="check check--square" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        Replace my encrypted backup with this device's tasks
      </label>
      <div className="account__row">
        <button type="submit" className="btn btn--primary" disabled={busy || !pass || !understood}>
          {busy ? 'Replacing…' : 'Replace backup'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Back
        </button>
      </div>
      <ErrorLine error={error} />
    </form>
  )
}

function Connected() {
  const sync = useStore((s) => s.sync)
  const { busy, error, run } = useAction()
  const [confirmDelete, setConfirmDelete] = useState('')
  const last = sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null
  return (
    <div className="dialog__body account">
      <div className="account__status">
        <Icon name="cloud" />
        <div>
          <p className="account__who">{sync.email}</p>
          <p className="account__fine" role="status">
            {sync.status === 'syncing' && 'Syncing…'}
            {sync.status === 'idle' && (last ? `Synced at ${last}. End-to-end encrypted.` : 'Up to date. End-to-end encrypted.')}
            {sync.status === 'offline' && 'Offline. Changes will sync when you reconnect.'}
            {sync.status === 'error' && (sync.message ?? 'Sync hit a problem.')}
          </p>
        </div>
      </div>
      <div className="account__row">
        <button type="button" className="btn" disabled={busy || sync.status === 'syncing'} onClick={() => void run(syncNow)}>
          Sync now
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          title="Your tasks stay on this device"
          onClick={() => void run(() => signOutCloud({ wipeDevice: false }))}
        >
          Sign out
        </button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void run(() => signOutCloud({ wipeDevice: true }))}>
          Sign out and clear this device
        </button>
      </div>
      <ErrorLine error={error} />
      <details className="account__danger">
        <summary>Delete account</summary>
        <p>
          This deletes your account and the encrypted backup from the server, permanently. Tasks on this device stay
          until you clear them. Type <strong>delete</strong> to confirm.
        </p>
        <div className="account__row">
          <input className="field" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} aria-label="Type delete to confirm" />
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy || confirmDelete.trim().toLowerCase() !== 'delete'}
            onClick={() => void run(deleteCloudAccount)}
          >
            Delete account
          </button>
        </div>
      </details>
      <PrivacyLink />
    </div>
  )
}

function SignOutLinks() {
  const { run, busy } = useAction()
  return (
    <button type="button" className="btn btn--ghost account__signout" disabled={busy} onClick={() => void run(() => signOutCloud({ wipeDevice: false }))}>
      Sign out
    </button>
  )
}

function PrivacyLink() {
  return (
    <p className="account__fine">
      <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer">
        Privacy and security details
      </a>
    </p>
  )
}
