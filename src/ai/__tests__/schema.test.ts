import { describe, expect, it } from 'vitest'
import { AnalyzeModelSchema, PlanModelSchema, sanitizeAnalyze, sanitizePlan } from '../schema'
import { AiError } from '../types'
import { CTX, suggestion } from './fixtures'

const wrap = (...tasks: unknown[]) => ({ tasks })

describe('model schemas', () => {
  it('accepts a full suggestion and rejects a missing required field', () => {
    expect(AnalyzeModelSchema.safeParse(wrap(suggestion())).success).toBe(true)
    const { effort: _effort, ...rest } = suggestion()
    expect(AnalyzeModelSchema.safeParse(wrap(rest)).success).toBe(false)
  })

  it('accepts a plan', () => {
    const plan = { order: [{ taskId: 'a', reason: 'b' }], dependencies: [{ taskId: 'a', after: ['b'] }], summary: 's' }
    expect(PlanModelSchema.safeParse(plan).success).toBe(true)
  })
})

describe('sanitizeAnalyze', () => {
  it('passes a clean suggestion through unchanged', () => {
    expect(sanitizeAnalyze(wrap(suggestion()), CTX)).toEqual(wrap(suggestion()))
  })

  it('drops unknown ids from after and blocks', () => {
    const out = sanitizeAnalyze(wrap(suggestion({ after: ['ghost', 't-essay'], blocks: ['t-resume', 'nope'] })), CTX)
    expect(out.tasks[0]!.after).toEqual(['t-essay'])
    expect(out.tasks[0]!.blocks).toEqual(['t-resume'])
  })

  it('removes duplicate ids and ids listed on both sides', () => {
    const out = sanitizeAnalyze(
      wrap(suggestion({ after: ['t-essay', 't-essay', 't-resume'], blocks: ['t-resume', 't-portfolio', 't-portfolio'] })),
      CTX,
    )
    expect(out.tasks[0]!.after).toEqual(['t-essay'])
    expect(out.tasks[0]!.blocks).toEqual(['t-portfolio'])
  })

  it('maps the area case-insensitively to the exact name, else null', () => {
    expect(sanitizeAnalyze(wrap(suggestion({ area: ' projects ' })), CTX).tasks[0]!.area).toBe('Projects')
    expect(sanitizeAnalyze(wrap(suggestion({ area: 'Gym' })), CTX).tasks[0]!.area).toBeNull()
    expect(sanitizeAnalyze(wrap(suggestion({ area: null })), CTX).tasks[0]!.area).toBeNull()
  })

  it.each([
    ['2026-10-20', '2026-10-20'], // yesterday is allowed
    ['2026-10-19', null], // too far in the past
    ['2029-10-21', '2029-10-21'], // exactly three years out
    ['2029-10-22', null],
    ['2026-02-30', null], // not a real day
    ['next friday', null],
    ['2026-10-24T10:00:00Z', null],
    [null, null],
  ])('due %s -> %s', (due, expected) => {
    expect(sanitizeAnalyze(wrap(suggestion({ due })), CTX).tasks[0]!.due).toBe(expected)
  })

  it('clamps title, steps, reason and drops empty steps', () => {
    const out = sanitizeAnalyze(
      wrap(
        suggestion({
          title: `  ${'x'.repeat(300)}  `,
          steps: ['  one  ', '', '   ', 'y'.repeat(200), ...Array.from({ length: 10 }, (_, i) => `s${i}`)],
          reason: 'r'.repeat(500),
        }),
      ),
      CTX,
    )
    const task = out.tasks[0]!
    expect(task.title).toHaveLength(200)
    expect(task.steps).toHaveLength(8)
    expect(task.steps[0]).toBe('one')
    expect(task.steps[1]).toHaveLength(120)
    expect(task.reason).toHaveLength(200)
  })

  it('falls back to the input text when the title is empty', () => {
    const out = sanitizeAnalyze(wrap(suggestion({ title: '   ' })), CTX, 'z'.repeat(250))
    expect(out.tasks[0]!.title).toBe('z'.repeat(200))
  })

  it('drops a task with an empty title when there is no fallback text', () => {
    expect(() => sanitizeAnalyze(wrap(suggestion({ title: ' ' })), CTX)).toThrow(AiError)
  })

  it('keeps at most five tasks', () => {
    const out = sanitizeAnalyze(wrap(...Array.from({ length: 8 }, (_, i) => suggestion({ title: `T${i}` }))), CTX)
    expect(out.tasks.map((t) => t.title)).toEqual(['T0', 'T1', 'T2', 'T3', 'T4'])
  })

  it('skips malformed tasks but keeps valid ones', () => {
    const out = sanitizeAnalyze(wrap({ title: 5 }, suggestion({ title: 'Good' })), CTX)
    expect(out.tasks.map((t) => t.title)).toEqual(['Good'])
  })

  it('turns blank notes, waitingOn and reason into null', () => {
    const task = sanitizeAnalyze(wrap(suggestion({ notes: ' ', waitingOn: '', reason: '  ' })), CTX).tasks[0]!
    expect([task.notes, task.waitingOn, task.reason]).toEqual([null, null, null])
  })

  it.each([[null], [undefined], ['text'], [42], [{}], [{ tasks: [] }], [{ tasks: 'x' }], [{ tasks: [null] }]])(
    'throws AiError(invalid) for %j',
    (raw) => {
      expect.assertions(2)
      try {
        sanitizeAnalyze(raw, CTX)
      } catch (e) {
        expect(e).toBeInstanceOf(AiError)
        expect((e as AiError).kind).toBe('invalid')
      }
    },
  )

  it('does not mutate its input', () => {
    const raw = wrap(suggestion({ after: ['ghost'] }))
    const copy = structuredClone(raw)
    sanitizeAnalyze(raw, CTX)
    expect(raw).toEqual(copy)
  })

  it('keeps unicode and emoji titles intact', () => {
    const out = sanitizeAnalyze(wrap(suggestion({ title: 'Купить молоко 🥛' })), CTX)
    expect(out.tasks[0]!.title).toBe('Купить молоко 🥛')
  })
})

describe('sanitizePlan', () => {
  const plan = (over: Record<string, unknown> = {}) => ({
    order: [
      { taskId: 't-essay', reason: 'Due in two days.' },
      { taskId: 't-resume', reason: 'Quick win.' },
    ],
    dependencies: [{ taskId: 't-resume', after: ['t-portfolio'] }],
    summary: 'Essay first, then the career updates.',
    ...over,
  })

  it('passes a clean plan through', () => {
    expect(sanitizePlan(plan(), CTX)).toEqual(plan())
  })

  it('drops unknown ids and duplicates from the order', () => {
    const out = sanitizePlan(
      plan({
        order: [
          { taskId: 'ghost', reason: 'x' },
          { taskId: 't-essay', reason: 'a' },
          { taskId: 't-essay', reason: 'b' },
        ],
      }),
      CTX,
    )
    expect(out.order).toEqual([{ taskId: 't-essay', reason: 'a' }])
  })

  it('drops self references, unknown ids and empty dependency entries', () => {
    const out = sanitizePlan(
      plan({
        dependencies: [
          { taskId: 't-resume', after: ['t-resume', 'ghost', 't-portfolio'] },
          { taskId: 't-essay', after: ['t-essay'] },
          { taskId: 'ghost', after: ['t-essay'] },
        ],
      }),
      CTX,
    )
    expect(out.dependencies).toEqual([{ taskId: 't-resume', after: ['t-portfolio'] }])
  })

  it('drops an edge that would create a cycle among proposals', () => {
    const out = sanitizePlan(
      plan({
        dependencies: [
          { taskId: 't-resume', after: ['t-portfolio'] },
          { taskId: 't-portfolio', after: ['t-resume'] },
        ],
      }),
      CTX,
    )
    expect(out.dependencies).toEqual([{ taskId: 't-resume', after: ['t-portfolio'] }])
  })

  it('clamps the summary and reasons', () => {
    const out = sanitizePlan(
      plan({ summary: 's'.repeat(400), order: [{ taskId: 't-essay', reason: 'r'.repeat(300) }] }),
      CTX,
    )
    expect(out.summary).toHaveLength(200)
    expect(out.order[0]!.reason).toHaveLength(200)
  })

  it('caps the order at 200 entries', () => {
    const ctx = { ...CTX, openTasks: Array.from({ length: 250 }, (_, i) => ({ ...CTX.openTasks[0]!, id: `id${i}` })) }
    const order = ctx.openTasks.map((t) => ({ taskId: t.id, reason: 'x' }))
    expect(sanitizePlan(plan({ order, dependencies: [] }), ctx).order).toHaveLength(200)
  })

  it('throws AiError(invalid) when nothing is usable', () => {
    expect(() => sanitizePlan(plan({ order: [{ taskId: 'ghost', reason: 'x' }], dependencies: [] }), CTX)).toThrow(AiError)
    expect(() => sanitizePlan(null, CTX)).toThrow(AiError)
    expect(() => sanitizePlan({ order: 'x' }, CTX)).toThrow(AiError)
  })
})
