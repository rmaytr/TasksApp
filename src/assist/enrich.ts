import { buildContext } from '../ai/context'
import type { AiTaskSuggestion } from '../ai/types'
import { formatDue } from '../lib/dates'
import type { Area, Task, TaskDraft } from '../model/types'
import { useStore, type AssistPatch } from '../store/useStore'
import { assistantError, getTransport } from './assistant'

const MAX_TEXT = 2000

const areaIdFor = (name: string | null, areas: Area[]): string | undefined =>
  name ? areas.find((a) => a.name.toLowerCase() === name.toLowerCase())?.id : undefined

function toPatch(s: AiTaskSuggestion, task: Task, areas: Area[], areaLocked: boolean): AssistPatch['patch'] {
  const areaId = areaLocked ? undefined : areaIdFor(s.area, areas)
  return {
    title: s.title || task.title,
    ...(areaId && { areaId }),
    due: s.due ?? task.due,
    ...(s.horizon && !s.due && { horizon: s.horizon }),
    high: s.priority === 'high',
    low: s.priority === 'low',
    effort: s.effort,
    ...(s.notes && !task.notes && { notes: s.notes }),
    ...(s.waitingOn && !task.waiting && { waiting: s.waitingOn }),
    ...(s.after.length > 0 && { after: s.after }),
  }
}

function toDraft(s: AiTaskSuggestion): TaskDraft {
  return {
    title: s.title,
    ...(s.area && { area: s.area }),
    due: s.due,
    ...(s.horizon && { horizon: s.horizon }),
    high: s.priority === 'high',
    low: s.priority === 'low',
    effort: s.effort,
    steps: s.steps.map((title) => ({ title })),
    ...(s.notes && { notes: s.notes }),
    ...(s.waitingOn && { waiting: s.waitingOn }),
  }
}

function summary(s: AiTaskSuggestion, areas: Area[], extra: number): string {
  const parts = [
    s.area && areas.some((a) => a.name.toLowerCase() === s.area?.toLowerCase()) ? s.area : null,
    s.due ? formatDue(s.due, new Date()) : null,
    s.steps.length ? `${s.steps.length} steps` : null,
    s.priority === 'high' ? 'high priority' : null,
    s.blocks.length || s.after.length ? 'ordered with related tasks' : null,
    extra ? `+${extra} more ${extra === 1 ? 'task' : 'tasks'}` : null,
  ].filter(Boolean)
  return parts.length ? `Sorted: ${parts.join(' · ')}` : 'Sorted by Cairn'
}

/**
 * Asks the assistant to fill in a freshly captured task: title, area, date, priority, steps,
 * and how it fits with existing tasks. Applied as one undoable change. Edits the user makes
 * while the assistant is thinking always win.
 */
export async function enrichWithAssistant(taskId: string, text: string, areaLocked: boolean): Promise<void> {
  const transport = await getTransport()
  if (!transport) return
  const store = useStore.getState()
  store.setAssistBusy(taskId, true)
  try {
    const { tasks, areas } = useStore.getState()
    const others = tasks.filter((t) => t.id !== taskId)
    const result = await transport.analyze(text.slice(0, MAX_TEXT), buildContext(others, areas, new Date()))
    const latest = useStore.getState().tasks.find((t) => t.id === taskId)
    const [first, ...rest] = result.tasks
    if (!latest || latest.done || !first) return
    // If the user already edited the task, only add what's missing (steps); never overwrite.
    const touched = latest.updatedAt !== latest.createdAt
    const patch = touched ? {} : toPatch(first, latest, useStore.getState().areas, areaLocked)
    useStore.getState().applyAssist({
      taskId,
      patch,
      steps: latest.steps.length === 0 ? first.steps : [],
      blocks: touched ? [] : first.blocks,
      extras: touched ? [] : rest.map(toDraft),
      message: summary(first, useStore.getState().areas, touched ? 0 : rest.length),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    useStore.getState().showToast(assistantError(error))
  } finally {
    useStore.getState().setAssistBusy(taskId, false)
  }
}
