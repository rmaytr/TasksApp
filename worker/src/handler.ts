import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { DEFAULT_MODEL, callAnalyze, callPlan, type ClaudeClient } from '../../src/ai/claude'
import { AiError, type AiErrorKind } from '../../src/ai/types'

/** The subset of a Cloudflare KV namespace the rate limiter uses. */
export interface KvLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

export interface Env {
  /** Secret. The operator's Anthropic key; never leaves the Worker. */
  ANTHROPIC_API_KEY?: string
  /** Comma-separated invite codes, each at least 16 characters (shorter ones are ignored). */
  INVITE_CODES?: string
  /** Comma-separated exact origins allowed to call the proxy from a browser. */
  ALLOWED_ORIGINS?: string
  /** Defaults to the shared DEFAULT_MODEL. */
  MODEL?: string
  /** Requests per invite code per UTC day. Defaults to 150. */
  DAILY_LIMIT?: string
  /** Required counters: per-code daily limits and failed-code throttling. */
  RATE_KV?: KvLike
}

export interface HandlerDeps {
  makeClient: (apiKey: string) => ClaudeClient
  now?: () => Date
}

export function makeClient(apiKey: string): ClaudeClient {
  return new Anthropic({ apiKey, maxRetries: 1, timeout: 45_000 })
}

// 150 context titles of up to 300 characters can pass 64 KB in UTF-8 (CJK, emoji).
const MAX_BODY_BYTES = 256 * 1024
/** Shorter codes can be guessed; e.g. `openssl rand -hex 12` gives 24 characters. */
const MIN_INVITE_LENGTH = 16
/** Wrong invite codes allowed per client IP per hour before it is told to wait. */
const MAX_FAILED_CODES_PER_HOUR = 20
const MAX_TEXT_CHARS = 2000
const DEFAULT_DAILY_LIMIT = 150
const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60
const INVITE_HEADER = 'X-Cairn-Invite'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// --- Request validation -------------------------------------------------------------------

const ContextSchema = z.object({
  today: z.string().regex(ISO_DATE),
  weekday: z.string().min(1).max(20),
  areas: z.array(z.string().max(40)).max(12),
  openTasks: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        title: z.string().max(300),
        area: z.string().max(40),
        due: z.string().regex(ISO_DATE).nullable(),
        priority: z.enum(['high', 'normal', 'low']),
      }),
    )
    .max(150),
})

const AnalyzeBodySchema = z.object({
  text: z.string().max(MAX_TEXT_CHARS).refine((value) => value.trim() !== ''),
  ctx: ContextSchema,
})

const PlanBodySchema = z.object({
  ctx: ContextSchema.refine((ctx) => ctx.openTasks.length > 0),
})

// --- Small helpers ------------------------------------------------------------------------

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function digestsEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < a.length && i < b.length; i += 1) diff |= (a[i] as number) ^ (b[i] as number)
  return diff === 0
}

/**
 * Compare the presented code with every configured code, hashing both sides first so the
 * comparison takes the same time whatever the input. Never stops at the first match.
 */
async function matchInviteCode(presented: string, configured: readonly string[]): Promise<string | null> {
  const presentedDigest = await sha256(presented)
  let matched: string | null = null
  for (const code of configured) {
    if (digestsEqual(presentedDigest, await sha256(code)) && matched === null) matched = code
  }
  return matched
}

/** Read the body but give up as soon as it exceeds `limit` bytes. Returns null when too large. */
async function readLimitedBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > limit) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

// --- Responses ----------------------------------------------------------------------------

function corsHeaders(origin: string | null, allowed: boolean, preflight: boolean): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (!origin || !allowed) return headers
  headers['Access-Control-Allow-Origin'] = origin
  if (preflight) {
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = `Content-Type, ${INVITE_HEADER}`
    headers['Access-Control-Max-Age'] = '86400'
  }
  return headers
}

function respond(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}

function fail(
  status: number,
  error: string,
  kind: AiErrorKind,
  headers: Record<string, string>,
  extra: Record<string, string> = {},
): Response {
  return respond({ error, kind }, status, { ...headers, ...extra })
}

/** Errors are deliberately generic: they never include what the user typed or what the model said. */
function failFromAi(error: unknown, headers: Record<string, string>): Response {
  if (error instanceof AiError) {
    switch (error.kind) {
      case 'auth': // The operator's key is bad: not the caller's fault, and not something to detail.
      case 'config':
        return fail(500, 'The assistant is not available right now.', 'config', headers)
      case 'rate':
        return fail(429, error.message, 'rate', headers, { 'Retry-After': '30' })
      case 'network':
        return fail(503, error.message, 'network', headers)
      case 'refusal':
        return fail(422, "The assistant can't help with that one. Try rewording it.", 'refusal', headers)
      case 'invalid':
        return fail(502, error.message, 'invalid', headers)
    }
  }
  if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError') {
    return fail(503, 'The request was interrupted.', 'network', headers)
  }
  return fail(500, 'Something went wrong.', 'config', headers)
}

// --- Rate limit ---------------------------------------------------------------------------

function dailyLimit(env: Env): number {
  const parsed = Number.parseInt(env.DAILY_LIMIT ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT
}

function secondsUntilUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000))
}

/**
 * Count one request against the code's daily budget. KV has no atomic increment, so two
 * simultaneous requests can slip past the limit by a request or two; it is a cost guard,
 * not a security boundary.
 */
async function consumeDailyAllowance(kv: KvLike, code: string, limit: number, now: Date): Promise<boolean> {
  const day = now.toISOString().slice(0, 10)
  const key = `rate:${toHex(await sha256(code))}:${day}`
  const used = Number.parseInt((await kv.get(key)) ?? '0', 10) || 0
  if (used >= limit) return false
  await safePut(kv, key, String(used + 1))
  return true
}

/** KV allows about one write per key per second; under a burst, skip the write rather than fail. */
async function safePut(kv: KvLike, key: string, value: string): Promise<void> {
  try {
    await kv.put(key, value, { expirationTtl: COUNTER_TTL_SECONDS })
  } catch {
    // The counter lags by a request; the Anthropic spend limit is the hard stop.
  }
}

/** Failed-code counter per client IP and hour, so invite codes can't be guessed at speed. */
async function failedCodeKey(request: Request, now: Date): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  return `fail:${toHex(await sha256(ip))}:${now.toISOString().slice(0, 13)}`
}

// --- Handler ------------------------------------------------------------------------------

type Route = '/analyze' | '/plan'

function routeOf(request: Request): Route | null {
  const { pathname } = new URL(request.url)
  return pathname === '/analyze' || pathname === '/plan' ? pathname : null
}

async function parseBody(request: Request, headers: Record<string, string>): Promise<{ body: unknown } | Response> {
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) {
    return fail(415, 'Send application/json.', 'invalid', headers)
  }
  const text = await readLimitedBody(request, MAX_BODY_BYTES)
  if (text === null) return fail(413, 'That request is too large.', 'invalid', headers)
  try {
    return { body: JSON.parse(text) as unknown }
  } catch {
    return fail(400, 'The request was not valid JSON.', 'invalid', headers)
  }
}

export async function handle(
  request: Request,
  env: Env,
  deps: HandlerDeps = { makeClient },
): Promise<Response> {
  try {
    return await route(request, env, deps)
  } catch {
    // Never log or echo: the request holds the user's tasks.
    return fail(500, 'Something went wrong.', 'config', { Vary: 'Origin' })
  }
}

async function route(request: Request, env: Env, deps: HandlerDeps): Promise<Response> {
  const path = routeOf(request)
  const isPreflight = request.method === 'OPTIONS'
  if (!path || (!isPreflight && request.method !== 'POST')) {
    return fail(404, 'Not found.', 'invalid', { Vary: 'Origin' })
  }

  const origin = request.headers.get('Origin')
  const originAllowed = origin !== null && splitList(env.ALLOWED_ORIGINS).includes(origin)
  const headers = corsHeaders(origin, originAllowed, isPreflight)
  if (origin !== null && !originAllowed) return fail(403, 'This site is not allowed to use the assistant.', 'auth', headers)
  if (isPreflight) return new Response(null, { status: 204, headers })

  const codes = splitList(env.INVITE_CODES).filter((c) => c.length >= MIN_INVITE_LENGTH)
  const kv = env.RATE_KV
  if (codes.length === 0 || !kv) return fail(500, 'The assistant is not set up yet.', 'config', headers)
  const now = (deps.now ?? (() => new Date()))()
  const failKey = await failedCodeKey(request, now)
  const failures = Number.parseInt((await kv.get(failKey)) ?? '0', 10) || 0
  if (failures >= MAX_FAILED_CODES_PER_HOUR) {
    return fail(429, 'Too many tries. Wait an hour and check the invite code.', 'rate', headers, { 'Retry-After': '3600' })
  }
  const code = await matchInviteCode((request.headers.get(INVITE_HEADER) ?? '').trim(), codes)
  if (code === null) {
    await safePut(kv, failKey, String(failures + 1))
    return fail(401, 'That invite code was not accepted.', 'auth', headers)
  }

  const parsedBody = await parseBody(request, headers)
  if (parsedBody instanceof Response) return parsedBody
  const apiKey = env.ANTHROPIC_API_KEY?.trim() ?? ''
  const model = env.MODEL?.trim() || DEFAULT_MODEL

  const schema = path === '/analyze' ? AnalyzeBodySchema : PlanBodySchema
  const validated = schema.safeParse(parsedBody.body)
  if (!validated.success) return fail(400, 'The request did not have the expected shape.', 'invalid', headers)
  if (apiKey === '') return fail(500, 'The assistant is not set up yet.', 'config', headers)

  if (!(await consumeDailyAllowance(kv, code, dailyLimit(env), now))) {
    return fail(429, 'Daily assistant limit reached. It resets tomorrow (UTC).', 'rate', headers, {
      'Retry-After': String(secondsUntilUtcMidnight(now)),
    })
  }

  try {
    const client = deps.makeClient(apiKey)
    const result =
      path === '/analyze'
        ? await callAnalyze(client, model, (validated.data as z.infer<typeof AnalyzeBodySchema>).text, validated.data.ctx)
        : await callPlan(client, model, validated.data.ctx)
    return respond(result, 200, headers)
  } catch (error) {
    return failFromAi(error, headers)
  }
}
