import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_MODEL, callAnalyze, callPlan, type ClaudeClient } from './claude'
import { sanitizeAnalyze, sanitizePlan } from './schema'
import { AiError } from './types'
import type { AiAnalyzeResult, AiErrorKind, AiPlanResult, AiTransport } from './types'

export { buildContext } from './context'

const REQUEST_TIMEOUT_MS = 45_000
const INVITE_HEADER = 'X-Cairn-Invite'

const ERROR_KINDS: readonly AiErrorKind[] = ['auth', 'rate', 'network', 'refusal', 'invalid', 'config']

// ---------------------------------------------------------------------------------------------
// Bring your own key
// ---------------------------------------------------------------------------------------------

function defaultClientFactory(apiKey: string): ClaudeClient {
  // `dangerouslyAllowBrowser` is acceptable ONLY because this transport is for a user's OWN key
  // on their OWN device: the key never leaves their browser except to api.anthropic.com. Never
  // use this with an operator-owned key; that is what the Cloudflare Worker proxy is for.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: REQUEST_TIMEOUT_MS })
}

/** Talks to Anthropic directly from the browser using the user's own API key. */
export function createByokTransport(
  apiKey: string,
  model: string = DEFAULT_MODEL,
  makeClient: (apiKey: string) => ClaudeClient = defaultClientFactory,
): AiTransport {
  let client: ClaudeClient | null = null
  const getClient = (): ClaudeClient => {
    if (apiKey.trim() === '') throw new AiError('Add your Anthropic API key in settings first.', 'config')
    client ??= makeClient(apiKey.trim())
    return client
  }
  return {
    async analyze(text, ctx, signal) {
      return callAnalyze(getClient(), model, text, ctx, signal)
    },
    async plan(ctx, signal) {
      return callPlan(getClient(), model, ctx, signal)
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Cairn proxy (Cloudflare Worker)
// ---------------------------------------------------------------------------------------------

function kindFromStatus(status: number): AiErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate'
  if (status === 422) return 'refusal'
  if (status === 500) return 'config'
  if (status === 503 || status === 504) return 'network'
  return 'invalid'
}

const FRIENDLY_BY_KIND: Record<AiErrorKind, string> = {
  auth: 'The invite code was not accepted.',
  rate: 'Too many requests. Try again in a moment.',
  network: 'Could not reach the assistant.',
  refusal: 'The assistant declined to help with that request.',
  invalid: 'The assistant returned something Cairn could not use.',
  config: 'The assistant is not set up correctly.',
}

async function errorFromResponse(response: Response): Promise<AiError> {
  let kind = kindFromStatus(response.status)
  let message: string | null = null
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null) {
      const { error, kind: reported } = body as { error?: unknown; kind?: unknown }
      if (typeof error === 'string' && error.trim() !== '') message = error.trim().slice(0, 300)
      if (typeof reported === 'string' && (ERROR_KINDS as readonly string[]).includes(reported)) {
        kind = reported as AiErrorKind
      }
    }
  } catch {
    // Not JSON (gateway page, empty body): the status alone decides.
  }
  return new AiError(message ?? FRIENDLY_BY_KIND[kind], kind)
}

function isAbort(error: unknown): boolean {
  // Duck-typed: a DOMException from another realm (jsdom, workers) is not `instanceof Error`.
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

/** Minimal fetch shape the proxy transport needs (the global `fetch` satisfies it). */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/** Talks to the Cairn Worker proxy, which holds the operator's key behind an invite code. */
export function createProxyTransport(
  baseUrl: string,
  inviteCode: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): AiTransport {
  const root = baseUrl.replace(/\/+$/, '')

  async function post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    let response: Response
    try {
      response = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [INVITE_HEADER]: inviteCode },
        body: JSON.stringify(body),
        signal,
        credentials: 'omit',
      })
    } catch (error) {
      if (isAbort(error)) throw error
      throw new AiError('Could not reach the assistant.', 'network')
    }
    if (!response.ok) throw await errorFromResponse(response)
    try {
      return await response.json()
    } catch {
      throw new AiError(FRIENDLY_BY_KIND.invalid, 'invalid')
    }
  }

  return {
    async analyze(text, ctx, signal): Promise<AiAnalyzeResult> {
      // Sanitize again: the proxy is trusted, but its response is still data crossing a boundary.
      return sanitizeAnalyze(await post('/analyze', { text, ctx }, signal), ctx, text)
    },
    async plan(ctx, signal): Promise<AiPlanResult> {
      return sanitizePlan(await post('/plan', { ctx }, signal), ctx)
    },
  }
}
