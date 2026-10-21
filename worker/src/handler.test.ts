// @vitest-environment node
// (Node's own Request/Response/crypto, as in a Worker, rather than jsdom's.)
import Anthropic from '@anthropic-ai/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CTX, suggestion } from '../../src/ai/__tests__/fixtures'
import type { ClaudeClient } from '../../src/ai/claude'
import { handle, type Env, type HandlerDeps, type KvLike } from './handler'

const ORIGIN = 'https://cairn.example.com'
const CODE = 'friend-code-0001-abcd'
const OTHER = 'other-code-0002-wxyz'

class MemoryKv implements KvLike {
  readonly store = new Map<string, string>()
  async get(key: string) {
    return this.store.get(key) ?? null
  }
  async put(key: string, value: string) {
    this.store.set(key, value)
  }
}

interface FakeReply {
  stop_reason?: string
  parsed_output?: unknown
}

function fakeDeps(reply: FakeReply | Error, now = new Date('2026-10-21T12:00:00Z')) {
  const parse = vi.fn(async (_params: unknown, _options?: unknown) => {
    if (reply instanceof Error) throw reply
    return { stop_reason: 'end_turn', content: [], parsed_output: null, ...reply }
  })
  const makeClient = vi.fn((_apiKey: string) => ({ beta: { messages: { parse } } }) as unknown as ClaudeClient)
  const deps: HandlerDeps = { makeClient, now: () => now }
  return { deps, parse, makeClient }
}

const analyzeOutput = { parsed_output: { tasks: [suggestion()] } }
const planOutput = {
  parsed_output: {
    order: [{ taskId: 't-essay', reason: 'Due soon.' }],
    dependencies: [{ taskId: 't-resume', after: ['t-portfolio'] }],
    summary: 'Essay first.',
  },
}

function env(over: Partial<Env> = {}): Env {
  return { ANTHROPIC_API_KEY: 'sk-test', INVITE_CODES: `${CODE}, ${OTHER}`, ALLOWED_ORIGINS: ORIGIN, RATE_KV: new MemoryKv(), ...over }
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://proxy.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cairn-Invite': CODE, Origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const analyzeBody = { text: 'Publish the domain this weekend', ctx: CTX }

afterEach(() => vi.restoreAllMocks())

describe('routing and CORS', () => {
  it('answers a preflight from an allowed origin', async () => {
    const response = await handle(
      new Request('https://proxy.test/analyze', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
      env(),
      fakeDeps({}).deps,
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Cairn-Invite')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(response.headers.get('Vary')).toBe('Origin')
  })

  it('refuses a preflight from another origin, with no CORS headers', async () => {
    const response = await handle(
      new Request('https://proxy.test/analyze', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }),
      env(),
      fakeDeps({}).deps,
    )
    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('matches origins exactly (no prefix or suffix tricks)', async () => {
    for (const origin of [`${ORIGIN}.evil.example`, 'http://cairn.example.com', `${ORIGIN}/`]) {
      const { deps, parse } = fakeDeps(analyzeOutput)
      const response = await handle(post('/analyze', analyzeBody, { Origin: origin }), env(), deps)
      expect(response.status).toBe(403)
      expect(parse).not.toHaveBeenCalled()
    }
  })

  it('adds CORS headers to real responses for an allowed origin', async () => {
    const response = await handle(post('/analyze', analyzeBody), env(), fakeDeps(analyzeOutput).deps)
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(response.headers.get('Vary')).toBe('Origin')
  })

  it('serves non-browser callers (no Origin header) without CORS headers', async () => {
    const request = new Request('https://proxy.test/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cairn-Invite': CODE },
      body: JSON.stringify(analyzeBody),
    })
    const response = await handle(request, env(), fakeDeps(analyzeOutput).deps)
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('returns 404 for unknown paths and wrong methods', async () => {
    const { deps } = fakeDeps(analyzeOutput)
    expect((await handle(post('/nope', analyzeBody), env(), deps)).status).toBe(404)
    expect((await handle(post('/analyze/', analyzeBody), env(), deps)).status).toBe(404)
    expect((await handle(new Request('https://proxy.test/analyze'), env(), deps)).status).toBe(404)
    expect((await handle(new Request('https://proxy.test/'), env(), deps)).status).toBe(404)
  })
})

describe('invite codes', () => {
  it('rejects a missing or wrong code with 401 and never calls Claude', async () => {
    const { deps, parse } = fakeDeps(analyzeOutput)
    const wrong = await handle(post('/analyze', analyzeBody, { 'X-Cairn-Invite': 'nope' }), env(), deps)
    expect(wrong.status).toBe(401)
    expect(((await wrong.json()) as { kind: string }).kind).toBe('auth')
    const missing = await handle(post('/analyze', analyzeBody, { 'X-Cairn-Invite': '' }), env(), deps)
    expect(missing.status).toBe(401)
    expect(parse).not.toHaveBeenCalled()
  })

  it('accepts any configured code, ignoring spaces around it', async () => {
    const { deps } = fakeDeps(analyzeOutput)
    const response = await handle(post('/analyze', analyzeBody, { 'X-Cairn-Invite': ` ${OTHER} ` }), env(), deps)
    expect(response.status).toBe(200)
  })

  it('does not accept a prefix of a code', async () => {
    const response = await handle(
      post('/analyze', analyzeBody, { 'X-Cairn-Invite': CODE.slice(0, -1) }),
      env(),
      fakeDeps(analyzeOutput).deps,
    )
    expect(response.status).toBe(401)
  })

  it('reports a config error when no codes are configured', async () => {
    const response = await handle(post('/analyze', analyzeBody), env({ INVITE_CODES: ' , ' }), fakeDeps({}).deps)
    expect(response.status).toBe(500)
  })

  it('reports a config error when the API key is missing', async () => {
    const { deps, makeClient } = fakeDeps(analyzeOutput)
    const response = await handle(post('/analyze', analyzeBody), env({ ANTHROPIC_API_KEY: undefined }), deps)
    expect(response.status).toBe(500)
    expect(((await response.json()) as { kind: string }).kind).toBe('config')
    expect(makeClient).not.toHaveBeenCalled()
  })
})

describe('daily rate limit', () => {
  it('returns 429 once a code has used its daily allowance', async () => {
    const kv = new MemoryKv()
    const { deps, parse } = fakeDeps(analyzeOutput)
    const config = env({ RATE_KV: kv, DAILY_LIMIT: '2' })
    expect((await handle(post('/analyze', analyzeBody), config, deps)).status).toBe(200)
    expect((await handle(post('/plan', { ctx: CTX }), config, fakeDeps(planOutput).deps)).status).toBe(200)
    const third = await handle(post('/analyze', analyzeBody), config, deps)
    expect(third.status).toBe(429)
    expect(((await third.json()) as { kind: string }).kind).toBe('rate')
    expect(Number(third.headers.get('Retry-After'))).toBe(12 * 60 * 60)
    expect(parse).toHaveBeenCalledTimes(1)
  })

  it('counts per code and per UTC day, keyed by a hash (never the raw code)', async () => {
    const kv = new MemoryKv()
    const config = env({ RATE_KV: kv, DAILY_LIMIT: '1' })
    const day1 = fakeDeps(analyzeOutput, new Date('2026-10-21T23:59:00Z')).deps
    const day2 = fakeDeps(analyzeOutput, new Date('2026-10-22T00:01:00Z')).deps

    expect((await handle(post('/analyze', analyzeBody), config, day1)).status).toBe(200)
    expect((await handle(post('/analyze', analyzeBody), config, day1)).status).toBe(429)
    // A different code has its own budget, and the next day starts fresh.
    expect((await handle(post('/analyze', analyzeBody, { 'X-Cairn-Invite': OTHER }), config, day1)).status).toBe(200)
    expect((await handle(post('/analyze', analyzeBody), config, day2)).status).toBe(200)

    const keys = [...kv.store.keys()]
    expect(keys).toHaveLength(3)
    for (const key of keys) {
      expect(key).toMatch(/^rate:[0-9a-f]{64}:2026-10-2[12]$/)
      expect(key).not.toContain(CODE)
    }
  })

  it('does not spend allowance on rejected or malformed requests', async () => {
    const kv = new MemoryKv()
    const config = env({ RATE_KV: kv, DAILY_LIMIT: '1' })
    const { deps } = fakeDeps(analyzeOutput)
    await handle(post('/analyze', analyzeBody, { 'X-Cairn-Invite': 'nope' }), config, deps)
    await handle(post('/analyze', { text: 'x' }), config, deps)
    await handle(post('/analyze', 'not json'), config, deps)
    expect([...kv.store.keys()].filter((k) => k.startsWith('rate:'))).toEqual([])
  })

  it('applies the default limit of 150 and ignores a bad DAILY_LIMIT', async () => {
    const kv = new MemoryKv()
    const { deps } = fakeDeps(analyzeOutput)
    const config = env({ RATE_KV: kv, DAILY_LIMIT: 'lots' })
    for (let i = 0; i < 3; i += 1) expect((await handle(post('/analyze', analyzeBody), config, deps)).status).toBe(200)
    const [key] = [...kv.store.keys()]
    kv.store.set(key!, '150')
    expect((await handle(post('/analyze', analyzeBody), config, deps)).status).toBe(429)
  })

  it('does not limit when no KV namespace is bound', async () => {
    const { deps } = fakeDeps(analyzeOutput)
    for (let i = 0; i < 3; i += 1) expect((await handle(post('/analyze', analyzeBody), env(), deps)).status).toBe(200)
  })
})

describe('request validation', () => {
  it('rejects a declared oversize body with 413', async () => {
    const { deps, parse } = fakeDeps(analyzeOutput)
    const request = post('/analyze', { ...analyzeBody, padding: 'x'.repeat(270_000) })
    expect((await handle(request, env(), deps)).status).toBe(413)
    expect(parse).not.toHaveBeenCalled()
  })

  it('rejects an oversize body even when Content-Length is missing or lies', async () => {
    const big = 'x'.repeat(270_000)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`{"text":"${big}"}`))
        controller.close()
      },
    })
    const request = new Request('https://proxy.test/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cairn-Invite': CODE, 'Content-Length': '20' },
      body: stream,
      duplex: 'half',
    } as RequestInit)
    expect((await handle(request, env(), fakeDeps(analyzeOutput).deps)).status).toBe(413)
  })

  it('rejects malformed JSON with 400', async () => {
    const response = await handle(post('/analyze', '{"text": '), env(), fakeDeps(analyzeOutput).deps)
    expect(response.status).toBe(400)
  })

  it('rejects a body that is not JSON content type with 415', async () => {
    const response = await handle(
      post('/analyze', JSON.stringify(analyzeBody), { 'Content-Type': 'text/plain' }),
      env(),
      fakeDeps(analyzeOutput).deps,
    )
    expect(response.status).toBe(415)
  })

  it.each([
    ['missing ctx', { text: 'a' }],
    ['non-string text', { text: 5, ctx: CTX }],
    ['blank text', { text: '   ', ctx: CTX }],
    ['text over 2000 chars', { text: 'a'.repeat(2001), ctx: CTX }],
    ['null body', null],
    ['too many areas', { text: 'a', ctx: { ...CTX, areas: Array.from({ length: 13 }, (_, i) => `A${i}`) } }],
    ['long area name', { text: 'a', ctx: { ...CTX, areas: ['A'.repeat(41)] } }],
    ['too many tasks', { text: 'a', ctx: { ...CTX, openTasks: Array.from({ length: 151 }, (_, i) => ({ ...CTX.openTasks[0], id: `i${i}` })) } }],
    ['long task title', { text: 'a', ctx: { ...CTX, openTasks: [{ ...CTX.openTasks[0], title: 'T'.repeat(301) }] } }],
    ['bad priority', { text: 'a', ctx: { ...CTX, openTasks: [{ ...CTX.openTasks[0], priority: 'urgent' }] } }],
    ['bad today', { text: 'a', ctx: { ...CTX, today: 'tomorrow' } }],
  ])('rejects %s with 400', async (_name, body) => {
    const { deps, parse } = fakeDeps(analyzeOutput)
    const response = await handle(post('/analyze', body), env(), deps)
    expect(response.status).toBe(400)
    expect(parse).not.toHaveBeenCalled()
  })

  it('accepts text of exactly 2000 chars and 150 tasks', async () => {
    const openTasks = Array.from({ length: 150 }, (_, i) => ({ ...CTX.openTasks[0]!, id: `i${i}` }))
    const response = await handle(
      post('/analyze', { text: 'a'.repeat(2000), ctx: { ...CTX, openTasks } }),
      env(),
      fakeDeps(analyzeOutput).deps,
    )
    expect(response.status).toBe(200)
  })

  it('rejects /plan with no open tasks', async () => {
    const response = await handle(post('/plan', { ctx: { ...CTX, openTasks: [] } }), env(), fakeDeps(planOutput).deps)
    expect(response.status).toBe(400)
  })
})

describe('calling Claude', () => {
  it('returns the sanitized analysis and uses the configured model', async () => {
    const { deps, parse, makeClient } = fakeDeps(analyzeOutput)
    const response = await handle(post('/analyze', analyzeBody), env({ MODEL: 'claude-haiku-5-5' }), deps)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const body = (await response.json()) as { tasks: { title: string; blocks: string[] }[] }
    expect(body.tasks[0]!.title).toBe('Publish the BOR Realty domain')
    expect(body.tasks[0]!.blocks).toEqual(['t-resume', 't-portfolio'])
    expect(makeClient).toHaveBeenCalledWith('sk-test')
    expect((parse.mock.calls[0]![0] as { model: string }).model).toBe('claude-haiku-5-5')
  })

  it('uses the default model when MODEL is unset', async () => {
    const { deps, parse } = fakeDeps(analyzeOutput)
    await handle(post('/analyze', analyzeBody), env(), deps)
    expect((parse.mock.calls[0]![0] as { model: string }).model).toBe('claude-opus-5-5')
  })

  it('returns the plan', async () => {
    const response = await handle(post('/plan', { ctx: CTX }), env(), fakeDeps(planOutput).deps)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { order: unknown[]; summary: string }
    expect(body.order).toHaveLength(1)
    expect(body.summary).toBe('Essay first.')
  })

  it('drops hallucinated task ids from the response', async () => {
    const hallucinated = {
      parsed_output: { tasks: [suggestion({ after: ['made-up'], blocks: ['t-resume', 'also-made-up'] })] },
    }
    const response = await handle(post('/analyze', analyzeBody), env(), fakeDeps(hallucinated).deps)
    const body = (await response.json()) as { tasks: { after: string[]; blocks: string[] }[] }
    expect(body.tasks[0]!.after).toEqual([])
    expect(body.tasks[0]!.blocks).toEqual(['t-resume'])
  })

  it('maps a refusal to 422 with a friendly message', async () => {
    const response = await handle(post('/analyze', analyzeBody), env(), fakeDeps({ stop_reason: 'refusal' }).deps)
    expect(response.status).toBe(422)
    const body = (await response.json()) as { error: string; kind: string }
    expect(body.kind).toBe('refusal')
    expect(body.error).toMatch(/rewording/i)
  })

  it('maps unusable model output to 502', async () => {
    const response = await handle(post('/analyze', analyzeBody), env(), fakeDeps({ parsed_output: { tasks: [] } }).deps)
    expect(response.status).toBe(502)
  })

  it.each([
    [401, 500, 'config'], // the operator's key is wrong: not the caller's problem
    [429, 429, 'rate'],
    [500, 503, 'network'],
  ])('maps an upstream %i to %i (%s)', async (upstream, status, kind) => {
    const error = Anthropic.APIError.generate(upstream, { error: { message: 'secret detail' } }, 'secret detail', new Headers())
    const response = await handle(post('/analyze', analyzeBody), env(), fakeDeps(error).deps)
    expect(response.status).toBe(status)
    const text = await response.text()
    expect((JSON.parse(text) as { kind: string }).kind).toBe(kind)
    expect(text).not.toContain('secret detail')
  })

  it('returns a generic 500 if something unexpected explodes, without echoing task text', async () => {
    const { deps } = fakeDeps(analyzeOutput)
    deps.makeClient = () => {
      throw new Error('boom: Publish the domain this weekend')
    }
    const response = await handle(post('/analyze', analyzeBody), env(), deps)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('Publish the domain')
  })

  it('never writes task contents to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method))
    await handle(post('/analyze', analyzeBody), env(), fakeDeps(analyzeOutput).deps)
    await handle(post('/analyze', analyzeBody), env(), fakeDeps(new Error('x')).deps)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

describe('abuse protection', () => {
  it('ignores invite codes shorter than 16 characters', async () => {
    const response = await handle(
      post('/analyze', analyzeBody, { 'X-Cairn-Invite': 'short-code' }),
      env({ INVITE_CODES: 'short-code' }),
      fakeDeps(analyzeOutput).deps,
    )
    expect(response.status).toBe(500)
    expect(((await response.json()) as { kind: string }).kind).toBe('config')
  })

  it('refuses to run without the rate-limit store', async () => {
    const response = await handle(post('/analyze', analyzeBody), env({ RATE_KV: undefined }), fakeDeps(analyzeOutput).deps)
    expect(response.status).toBe(500)
  })

  it('makes an IP wait after 20 wrong codes in an hour, even with a right one', async () => {
    const kv = new MemoryKv()
    const config = env({ RATE_KV: kv })
    const { deps, parse } = fakeDeps(analyzeOutput)
    const ip = { 'CF-Connecting-IP': '203.0.113.9' }
    for (let i = 0; i < 20; i += 1) {
      expect((await handle(post('/analyze', analyzeBody, { ...ip, 'X-Cairn-Invite': `guess-${i}-xxxxxxxxxx` }), config, deps)).status).toBe(401)
    }
    expect((await handle(post('/analyze', analyzeBody, ip), config, deps)).status).toBe(429)
    expect(parse).not.toHaveBeenCalled()
    // Another address is unaffected, and no key stores the raw IP.
    expect((await handle(post('/analyze', analyzeBody, { 'CF-Connecting-IP': '198.51.100.4' }), config, deps)).status).toBe(200)
    expect([...kv.store.keys()].some((k) => k.includes('203.0.113.9'))).toBe(false)
  })

  it('still answers when the counter write fails under a burst', async () => {
    const kv = new MemoryKv()
    kv.put = async () => {
      throw new Error('429 Too Many Requests')
    }
    const response = await handle(post('/analyze', analyzeBody), env({ RATE_KV: kv }), fakeDeps(analyzeOutput).deps)
    expect(response.status).toBe(200)
  })
})
