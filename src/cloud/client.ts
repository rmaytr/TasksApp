import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { cloudConfig, cloudEnabled } from './config'

let clientPromise: Promise<SupabaseClient> | null = null

/** Lazily loads supabase-js so people who never sign in never download it. */
export function getClient(): Promise<SupabaseClient> {
  if (!cloudEnabled) return Promise.reject(new Error('Sync is not set up for this copy of Nearer.'))
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(cloudConfig.url, cloudConfig.anonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  )
  return clientPromise
}

/** Where sign-in links and OAuth return to: this page, without the view hash. */
function returnUrl(): string {
  return `${location.origin}${location.pathname}`
}

export async function currentSession(): Promise<Session | null> {
  const client = await getClient()
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  return data.session
}

/** Emails a one-time sign-in code (and link). No password exists anywhere. */
export async function sendSignInCode(email: string): Promise<void> {
  const client = await getClient()
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: returnUrl() } })
  if (error) throw new Error(friendlyAuthError(error.message))
}

export async function verifySignInCode(email: string, code: string): Promise<Session> {
  const client = await getClient()
  const { data, error } = await client.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
  if (error || !data.session) throw new Error(friendlyAuthError(error?.message ?? 'That code did not work.'))
  return data.session
}

export async function signInWithProvider(provider: 'github' | 'google'): Promise<void> {
  const client = await getClient()
  const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl() } })
  if (error) throw new Error(friendlyAuthError(error.message))
}

export async function signOut(): Promise<void> {
  const client = await getClient()
  await client.auth.signOut({ scope: 'local' })
}

/** Deletes the auth user server-side; the encrypted vault row is removed by cascade. */
export async function deleteAccount(): Promise<void> {
  const client = await getClient()
  const { error } = await client.rpc('delete_my_account')
  if (error) throw new Error(`Couldn't delete the account: ${error.message}`)
  await client.auth.signOut({ scope: 'local' })
}

export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('signups not allowed') || m.includes('signup is disabled'))
    return 'Nearer is invite-only for now. Ask whoever shared it with you to send an invite to this email.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Too many attempts. Wait a minute and try again.'
  if (m.includes('expired') || m.includes('invalid'))
    return 'That code is wrong or has expired. Request a new one.'
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'Can’t reach the sync server. Check your connection.'
  return message
}
