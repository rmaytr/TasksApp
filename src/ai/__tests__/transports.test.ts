import { describe, expect, it, vi } from 'vitest'
import type { Area, Task } from '../../model/types'
import type { ClaudeClient } from '../claude'
import { buildContext, createByokTransport, createProxyTransport } from '../transports'
import { AiError } from '../types'
import { CTX, suggestion } from './fixtures'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (e) {
    if (e instanceof AiError) return e.kind
    throw e
  }
  return 'no error'
}

describe('createProxyTransport', () => {
  it('POSTs {text, ctx} to /analyze with the invite header and sanitizes the response', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ tasks: [suggestion({ blocks: ['t-resume', 'ghost'] })] }),
    )
    const transport = createProxyTransport('https://ai.example.com/', 'secret-code', fetchImpl)
    const result = await transport.analyze('Publish the domain', CTX)

    expect(result.tasks[0]!.blocks).toEqual(['t-resume'])
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://ai.example.com/analyze')
    expect(init!.method).toBe('POST')
    expect((init!.headers as Record<string, string>)['X-Cairn-Invite']).toBe('secret-code')
    expect((init!.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init!.body as string)).toEqual({ text: 'Publish the domain', ctx: CTX })
  })

  it('POSTs {ctx} to /plan', async () => {
    const plan = { order: [{ taskId: 't-essay', reason: 'Due soon.' }], dependencies: [], summary: 'Go.' }
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => json(plan))
    const result = await createProxyTransport('https://ai.example.com', 'c', fetchImpl).plan(CTX)
    expect(result.order).toHaveLength(1)
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://ai.example.com/plan')
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)).toEqual({ ctx: CTX })
  })

  it('passes the abort signal to fetch', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => json({ tasks: [suggestion()] }))
    const controller = new AbortController()
    await createProxyTransport('https://x.test', 'c', fetchImpl).analyze('a', CTX, controller.signal)
    expect(fetchImpl.mock.calls[0]![1]!.signal).toBe(controller.signal)
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate'],
    [422, 'refusal'],
    [400, 'invalid'],
    [413, 'invalid'],
    [500, 'config'],
    [502, 'invalid'],
    [503, 'network'],
  ])('maps HTTP %i without a body to %s', async (status, kind) => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status }))
    expect(await kindOf(createProxyTransport('https://x.test', 'c', fetchImpl).analyze('a', CTX))).toBe(kind)
  })

  it('prefers the error kind reported by the proxy and keeps its message', async () => {
    const fetchImpl = vi.fn(async () => json({ error: 'Slow down, please.', kind: 'rate' }, 503))
    const error = await createProxyTransport('https://x.test', 'c', fetchImpl)
      .analyze('a', CTX)
      .catch((e: unknown) => e)
    expect((error as AiError).kind).toBe('rate')
    expect((error as AiError).message).toBe('Slow down, please.')
  })

  it('maps a network failure to network', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await kindOf(createProxyTransport('https://x.test', 'c', fetchImpl).plan(CTX))).toBe('network')
  })

  it('rethrows an abort as an AbortError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(createProxyTransport('https://x.test', 'c', fetchImpl).analyze('a', CTX)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('treats a non-JSON success body as invalid', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>', { status: 200 }))
    expect(await kindOf(createProxyTransport('https://x.test', 'c', fetchImpl).analyze('a', CTX))).toBe('invalid')
  })

  it('treats a response with nothing usable as invalid', async () => {
    const fetchImpl = vi.fn(async () => json({ tasks: [] }))
    expect(await kindOf(createProxyTransport('https://x.test', 'c', fetchImpl).analyze('a', CTX))).toBe('invalid')
  })
})

describe('createByokTransport', () => {
  function fakeFactory(output: unknown) {
    const parse = vi.fn(async (_params: unknown, _options?: unknown) => ({
      stop_reason: 'end_turn',
      content: [],
      parsed_output: output,
    }))
    const makeClient = vi.fn((_apiKey: string) => ({ beta: { messages: { parse } } }) as unknown as ClaudeClient)
    return { parse, makeClient }
  }

  it('analyzes through the injected client with the chosen model', async () => {
    const { parse, makeClient } = fakeFactory({ tasks: [suggestion()] })
    const transport = createByokTransport('sk-ant-test', 'claude-sonnet-5-5', makeClient)
    const result = await transport.analyze('Publish the domain', CTX)

    expect(result.tasks[0]!.title).toBe('Publish the BOR Realty domain')
    expect(makeClient).toHaveBeenCalledWith('sk-ant-test')
    expect((parse.mock.calls[0]![0] as { model: string }).model).toBe('claude-sonnet-5-5')
  })

  it('defaults to the default model and plans', async () => {
    const { parse, makeClient } = fakeFactory({
      order: [{ taskId: 't-essay', reason: 'Soon.' }],
      dependencies: [],
      summary: 'ok',
    })
    const result = await createByokTransport('k', undefined, makeClient).plan(CTX)
    expect(result.order).toHaveLength(1)
    expect((parse.mock.calls[0]![0] as { model: string }).model).toBe('claude-haiku-5-5')
  })

  it('creates the client once, lazily', async () => {
    const { makeClient } = fakeFactory({ tasks: [suggestion()] })
    const transport = createByokTransport('k', undefined, makeClient)
    expect(makeClient).not.toHaveBeenCalled()
    await transport.analyze('a', CTX)
    await transport.analyze('b', CTX)
    expect(makeClient).toHaveBeenCalledTimes(1)
  })

  it('rejects with AiError(config) when the key is blank', async () => {
    const { makeClient } = fakeFactory({})
    expect(await kindOf(createByokTransport('  ', undefined, makeClient).analyze('a', CTX))).toBe('config')
    expect(makeClient).not.toHaveBeenCalled()
  })
})

describe('buildContext', () => {
  const areas: Area[] = [
    { id: 'a1', name: 'Projects', color: 'indigo' },
    { id: 'a2', name: 'School', color: 'teal' },
  ]
  let counter = 0
  const task = (over: Partial<Task>): Task => ({
    id: `t${++counter}`,
    title: 'Task',
    notes: 'private notes must not be sent',
    areaId: 'a1',
    horizon: 'week',
    due: null,
    high: false,
    effort: 'm',
    waiting: null,
    plan: null,
    steps: [],
    done: false,
    doneAt: null,
    createdAt: 0,
    updatedAt: 0,
    spentMinutes: 0,
    ...over,
  })

  it('uses the local date and English weekday', () => {
    const ctx = buildContext([], areas, new Date(2026, 9, 21, 23, 30))
    expect(ctx.today).toBe('2026-10-21')
    expect(ctx.weekday).toBe('Wednesday')
    expect(ctx.areas).toEqual(['Projects', 'School'])
  })

  it('includes open tasks only, with area names and priority, and no notes', () => {
    const ctx = buildContext(
      [
        task({ id: 'open', title: 'Open one', areaId: 'a2', high: true }),
        task({ id: 'closed', done: true }),
        task({ id: 'low', low: true }),
        task({ id: 'orphan', areaId: 'gone' }),
      ],
      areas,
      new Date(2026, 9, 21),
    )
    expect(ctx.openTasks.map((t) => t.id).sort()).toEqual(['low', 'open', 'orphan'])
    const open = ctx.openTasks.find((t) => t.id === 'open')
    expect(open).toEqual({ id: 'open', title: 'Open one', area: 'School', due: null, priority: 'high' })
    expect(ctx.openTasks.find((t) => t.id === 'low')!.priority).toBe('low')
    expect(ctx.openTasks.find((t) => t.id === 'orphan')!.area).toBe('')
    expect(JSON.stringify(ctx)).not.toContain('private notes')
  })

  it('sorts by due date (undated last), then priority', () => {
    const ctx = buildContext(
      [
        task({ id: 'none-normal' }),
        task({ id: 'none-high', high: true }),
        task({ id: 'late', due: '2026-11-01' }),
        task({ id: 'soon-low', due: '2026-10-22', low: true }),
        task({ id: 'soon-high', due: '2026-10-22', high: true }),
      ],
      areas,
      new Date(2026, 9, 21),
    )
    expect(ctx.openTasks.map((t) => t.id)).toEqual(['soon-high', 'soon-low', 'late', 'none-high', 'none-normal'])
  })

  it('caps at 150 tasks keeping the most urgent, and clips long titles and area names', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      task({ id: `m${i}`, title: 'T'.repeat(400), due: i === 199 ? '2026-10-22' : null }),
    )
    const ctx = buildContext(many, [{ id: 'a1', name: 'N'.repeat(80), color: 'rose' }], new Date(2026, 9, 21))
    expect(ctx.openTasks).toHaveLength(150)
    expect(ctx.openTasks[0]!.id).toBe('m199')
    expect(ctx.openTasks[0]!.title).toHaveLength(300)
    expect(ctx.areas[0]).toHaveLength(40)
    expect(ctx.openTasks[0]!.area).toHaveLength(40)
  })

  it('does not mutate its inputs', () => {
    const tasks = [task({ due: '2026-11-01' }), task({ due: '2026-10-22' })]
    const before = structuredClone(tasks)
    buildContext(tasks, areas, new Date(2026, 9, 21))
    expect(tasks).toEqual(before)
  })
})
