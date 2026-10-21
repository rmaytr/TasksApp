import type { Effort, Horizon, Priority } from '../model/types'

/** What the assistant is allowed to know about one open task. */
export interface AiContextTask {
  id: string
  title: string
  area: string
  due: string | null
  priority: Priority
}

export interface AiContext {
  /** YYYY-MM-DD, local calendar day. */
  today: string
  /** English weekday name of `today`, e.g. "Wednesday". */
  weekday: string
  areas: string[]
  openTasks: AiContextTask[]
}

export interface AiTaskSuggestion {
  title: string
  area: string | null
  due: string | null
  horizon: Horizon | null
  priority: Priority
  effort: Effort
  steps: string[]
  notes: string | null
  waitingOn: string | null
  /** Ids of EXISTING open tasks this new task should wait for. */
  after: string[]
  /** Ids of EXISTING open tasks that should wait for this one. */
  blocks: string[]
  /** One short plain sentence explaining a dependency/ordering choice, else null. */
  reason: string | null
}

/** Usually one task; up to five only if the text clearly lists separate tasks. */
export interface AiAnalyzeResult {
  tasks: AiTaskSuggestion[]
}

export interface AiPlanResult {
  order: { taskId: string; reason: string }[]
  dependencies: { taskId: string; after: string[] }[]
  summary: string
}

export interface AiTransport {
  analyze(text: string, ctx: AiContext, signal?: AbortSignal): Promise<AiAnalyzeResult>
  plan(ctx: AiContext, signal?: AbortSignal): Promise<AiPlanResult>
}

export type AiErrorKind = 'auth' | 'rate' | 'network' | 'refusal' | 'invalid' | 'config'

export class AiError extends Error {
  // Declared explicitly: `erasableSyntaxOnly` forbids constructor parameter properties.
  readonly kind: AiErrorKind

  constructor(message: string, kind: AiErrorKind) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
  }
}
