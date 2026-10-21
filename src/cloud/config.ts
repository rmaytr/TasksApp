/**
 * Cloud sync is optional and only exists when the build is given a Supabase project.
 * Without these variables the app is purely local and hides every account feature.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const providers = (import.meta.env.VITE_AUTH_PROVIDERS as string | undefined) ?? ''

export const cloudConfig = {
  url: url?.trim() ?? '',
  /** The public "anon"/publishable key. Safe in the browser: Row Level Security does the protecting. */
  anonKey: anonKey?.trim() ?? '',
  /** Optional OAuth buttons, e.g. "github,google" (each must be enabled in Supabase). */
  oauthProviders: providers
    .split(',')
    .map((p) => p.trim())
    .filter((p): p is 'github' | 'google' => p === 'github' || p === 'google'),
}

export const cloudEnabled = cloudConfig.url.startsWith('https://') && cloudConfig.anonKey.length > 20
