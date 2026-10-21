import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MODEL, callAnalyze, callPlan, type ClaudeClient } from '../claude'
import { ANALYZE_SYSTEM, PLAN_SYSTEM } from '../prompts'
import { AiError } from '../types'
import { CTX, suggestion } from './fixtures'

interface FakeReply {
  stop_reason?: string | null
  parsed_output?: unknown
  content?: unknown[]
}

function fakeClient(reply: FakeReply | Error) {
  const parse = vi.fn(async (_params: unknown, _options?: unknown) => {
    if (reply instanceof Error) throw reply
    return { stop_reason: 'end_turn', content: [], parsed_output: null, ...reply }
  })
  return { client: { beta: { messages: { parse } } } as unknown as ClaudeClient, parse }
}

const headers = new Headers()
const sdkError = (status: number) => Anthropic.APIError.generate(status, { error: { message: 'x' } }, 'x', headers)

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (e) {
    if (e instanceof AiError) return e.kind
    throw e
  }
  return 'no error'
}

describe('callAnalyze', () => {
  it('sends the documented request and returns the sanitized result', async () => {
    const { client, parse } = fakeClient({ parsed_output: { tasks: [suggestion({ after: ['ghost'] })] } })
    const result = await callAnalyze(client, DEFAULT_MODEL, 'Publish the domain this weekend', CTX)

    expect(result.tasks[0]!.after).toEqual([])
    expect(result.tasks[0]!.blocks).toEqual(['t-resume', 't-portfolio'])

    const params = parse.mock.calls[0]![0] as Record<string, any>
    expect(params.model).toBe('claude-opus-5-5')
    expect(params.max_tokens).toBe(4000)
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(params.fallbacks).toBe('default')
    expect(params.output_config.effort).toBe('low')
    expect(params.output_config.format.type).toBe('json_schema')
    expect(params.system).toEqual([{ type: 'text', text: ANALYZE_SYSTEM, cache_control: { type: 'ephemeral' } }])
    expect(params.messages).toHaveLength(1)
    expect(params.messages[0].role).toBe('user')
    expect(params.messages[0].content).toContain('Publish the domain this weekend')
    expect(params).not.toHaveProperty('thinking')
    expect(params).not.toHaveProperty('temperature')
  })

  it('forwards the abort signal and a custom model', async () => {
    const { client, parse } = fakeClient({ parsed_output: { tasks: [suggestion()] } })
    const controller = new AbortController()
    await callAnalyze(client, 'claude-haiku-5-5', 'x', CTX, controller.signal)
    expect((parse.mock.calls[0]![0] as { model: string }).model).toBe('claude-haiku-5-5')
    expect(parse.mock.calls[0]![1]).toEqual({ signal: controller.signal })
  })

  it('falls back to the JSON text block when there is no parsed output', async () => {
    const { client } = fakeClient({ content: [{ type: 'text', text: JSON.stringify({ tasks: [suggestion()] }) }] })
    expect((await callAnalyze(client, DEFAULT_MODEL, 'x', CTX)).tasks).toHaveLength(1)
  })

  it('uses the input text as the title when the model returns an empty one', async () => {
    const { client } = fakeClient({ parsed_output: { tasks: [suggestion({ title: '' })] } })
    expect((await callAnalyze(client, DEFAULT_MODEL, 'Call grandma', CTX)).tasks[0]!.title).toBe('Call grandma')
  })

  it('maps a refusal stop reason to AiError(refusal)', async () => {
    const { client } = fakeClient({ stop_reason: 'refusal' })
    expect(await kindOf(callAnalyze(client, DEFAULT_MODEL, 'x', CTX))).toBe('refusal')
  })

  it('maps max_tokens to AiError(invalid)', async () => {
    const { client } = fakeClient({ stop_reason: 'max_tokens', parsed_output: { tasks: [suggestion()] } })
    expect(await kindOf(callAnalyze(client, DEFAULT_MODEL, 'x', CTX))).toBe('invalid')
  })

  it('maps empty or unparseable output to AiError(invalid)', async () => {
    expect(await kindOf(callAnalyze(fakeClient({}).client, DEFAULT_MODEL, 'x', CTX))).toBe('invalid')
    const garbled = fakeClient({ content: [{ type: 'text', text: 'not json' }] })
    expect(await kindOf(callAnalyze(garbled.client, DEFAULT_MODEL, 'x', CTX))).toBe('invalid')
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate'],
    [400, 'invalid'],
    [404, 'invalid'],
    [500, 'network'],
    [529, 'network'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const { client } = fakeClient(sdkError(status))
    expect(await kindOf(callAnalyze(client, DEFAULT_MODEL, 'x', CTX))).toBe(kind)
  })

  it('maps connection failures and timeouts to network', async () => {
    const down = fakeClient(new Anthropic.APIConnectionError({ message: 'offline' }))
    expect(await kindOf(callAnalyze(down.client, DEFAULT_MODEL, 'x', CTX))).toBe('network')
    const slow = fakeClient(new Anthropic.APIConnectionTimeoutError())
    expect(await kindOf(callAnalyze(slow.client, DEFAULT_MODEL, 'x', CTX))).toBe('network')
  })

  it('surfaces an abort as an AbortError, not an AiError', async () => {
    const { client } = fakeClient(new Anthropic.APIUserAbortError())
    await expect(callAnalyze(client, DEFAULT_MODEL, 'x', CTX)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('maps unexpected errors to invalid without leaking their message', async () => {
    const { client } = fakeClient(new SyntaxError('secret text from the model'))
    const error = await callAnalyze(client, DEFAULT_MODEL, 'x', CTX).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('invalid')
    expect((error as AiError).message).not.toContain('secret')
  })
})

describe('callPlan', () => {
  const planOutput = {
    order: [{ taskId: 't-essay', reason: 'Due soon.' }],
    dependencies: [{ taskId: 't-resume', after: ['t-portfolio', 'ghost'] }],
    summary: 'Essay first.',
  }

  it('uses the plan system prompt and sanitizes the result', async () => {
    const { client, parse } = fakeClient({ parsed_output: planOutput })
    const result = await callPlan(client, DEFAULT_MODEL, CTX)
    expect(result.dependencies).toEqual([{ taskId: 't-resume', after: ['t-portfolio'] }])
    const params = parse.mock.calls[0]![0] as Record<string, any>
    expect(params.system[0].text).toBe(PLAN_SYSTEM)
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(params.messages[0].content).toContain('t-essay')
  })

  it('maps refusals and rate limits like analyze', async () => {
    expect(await kindOf(callPlan(fakeClient({ stop_reason: 'refusal' }).client, DEFAULT_MODEL, CTX))).toBe('refusal')
    expect(await kindOf(callPlan(fakeClient(sdkError(429)).client, DEFAULT_MODEL, CTX))).toBe('rate')
  })
})
