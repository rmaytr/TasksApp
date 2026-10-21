import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ZodType } from 'zod'
import { ANALYZE_SYSTEM, PLAN_SYSTEM, analyzeUserMessage, planUserMessage } from './prompts'
import { AnalyzeModelSchema, PlanModelSchema, sanitizeAnalyze, sanitizePlan } from './schema'
import { AiError } from './types'
import type { AiAnalyzeResult, AiContext, AiPlanResult } from './types'

/**
 * Shared Claude calls. The browser (bring-your-own-key) transport and the Cloudflare Worker proxy
 * both go through here, so prompts, request shape, error mapping and sanitizing live in one place.
 */

/**
 * Haiku 5.5: these are short extraction and ordering jobs, and it costs about 1/40th of Opus 5.5
 * ($0.10 / $0.50 per MTok vs $4 / $20). Operators can still pick another model (Worker `MODEL` var).
 */
export const DEFAULT_MODEL = 'claude-haiku-5-5'

const MAX_TOKENS = 4000
/** Lets the API retry a policy refusal on a substitute model instead of failing the request. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
/** Haiku has no server-side fallback; sending the option there only adds a beta header. */
const hasFallback = (model: string): boolean => !model.startsWith('claude-haiku')

/** The slice of the SDK client we use; the real `Anthropic` client satisfies it, so tests can fake it. */
export interface ClaudeClient {
  beta: { messages: { parse: Anthropic['beta']['messages']['parse'] } }
}

interface CallSpec<T> {
  client: ClaudeClient
  model: string
  system: string
  user: string
  schema: ZodType
  signal: AbortSignal | undefined
  sanitize: (raw: unknown) => T
}

function mapError(error: unknown): Error {
  if (error instanceof AiError) return error
  if (error instanceof Anthropic.APIUserAbortError) return new DOMException('The request was aborted.', 'AbortError')
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiError('The API key was not accepted.', 'auth')
  }
  if (error instanceof Anthropic.RateLimitError) return new AiError('Too many requests. Try again in a moment.', 'rate')
  if (error instanceof Anthropic.APIConnectionError) return new AiError('Could not reach the assistant.', 'network')
  if (error instanceof Anthropic.APIError) {
    // 5xx (including 529 "overloaded") is the service being unavailable, which is worth retrying.
    if (typeof error.status === 'number' && error.status >= 500) {
      return new AiError('The assistant is busy right now. Try again in a moment.', 'network')
    }
    return new AiError('The assistant could not handle that request.', 'invalid')
  }
  // SDK parse failures (bad JSON / schema mismatch) land here. Never echo their message: it can contain model output.
  return new AiError('The assistant returned something Cairn could not use.', 'invalid')
}

/** The structured output, from the SDK's parsed value or, failing that, the first text block. */
function extractOutput(message: { parsed_output?: unknown; content: readonly unknown[] }): unknown {
  if (message.parsed_output !== null && message.parsed_output !== undefined) return message.parsed_output
  for (const block of message.content) {
    const candidate = block as { type?: string; text?: string }
    if (candidate.type === 'text' && typeof candidate.text === 'string') return JSON.parse(candidate.text)
  }
  throw new AiError('The assistant returned no answer.', 'invalid')
}

async function run<T>(spec: CallSpec<T>): Promise<T> {
  try {
    const message = await spec.client.beta.messages.parse(
      {
        model: spec.model,
        max_tokens: MAX_TOKENS,
        ...(hasFallback(spec.model) && { betas: [FALLBACK_BETA], fallbacks: 'default' as const }),
        // No `thinking` and no temperature: current models think adaptively and reject sampling overrides.
        output_config: { effort: 'low', format: zodOutputFormat(spec.schema) },
        system: [{ type: 'text', text: spec.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: spec.user }],
      },
      { signal: spec.signal },
    )
    if (message.stop_reason === 'refusal') {
      throw new AiError('The assistant declined to help with that request.', 'refusal')
    }
    if (message.stop_reason === 'max_tokens') {
      throw new AiError('The assistant ran out of room before finishing.', 'invalid')
    }
    return spec.sanitize(extractOutput(message))
  } catch (error) {
    throw mapError(error)
  }
}

export function callAnalyze(
  client: ClaudeClient,
  model: string,
  text: string,
  ctx: AiContext,
  signal?: AbortSignal,
): Promise<AiAnalyzeResult> {
  return run({
    client,
    model,
    system: ANALYZE_SYSTEM,
    user: analyzeUserMessage(text, ctx),
    schema: AnalyzeModelSchema,
    signal,
    sanitize: (raw) => sanitizeAnalyze(raw, ctx, text),
  })
}

export function callPlan(
  client: ClaudeClient,
  model: string,
  ctx: AiContext,
  signal?: AbortSignal,
): Promise<AiPlanResult> {
  return run({
    client,
    model,
    system: PLAN_SYSTEM,
    user: planUserMessage(ctx),
    schema: PlanModelSchema,
    signal,
    sanitize: (raw) => sanitizePlan(raw, ctx),
  })
}
