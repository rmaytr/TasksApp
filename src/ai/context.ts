import type { Area, Priority, Task } from '../model/types'
import { priorityOf } from '../model/types'
import { MAX_CONTEXT_TASKS } from './prompts'
import type { AiContext, AiContextTask } from './types'

// Kept apart from transports.ts so the app can build context without loading the Anthropic SDK.

const MAX_TITLE = 300
const MAX_AREA_NAME = 40
const MAX_AREAS = 12

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function clip(value: string, max: number): string {
  const chars = Array.from(value.trim())
  return chars.length <= max ? chars.join('') : chars.slice(0, max).join('')
}

function compareUrgency(a: AiContextTask, b: AiContextTask): number {
  if (a.due !== b.due) {
    if (a.due === null) return 1
    if (b.due === null) return -1
    return a.due < b.due ? -1 : 1
  }
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}

/**
 * What the assistant may see: today, the area names and the open tasks (title, area, due,
 * priority), most urgent first. Notes, steps and everything else stay on the device.
 */
export function buildContext(tasks: readonly Task[], areas: readonly Area[], now: Date): AiContext {
  const areaNameById = new Map(areas.map((area) => [area.id, clip(area.name, MAX_AREA_NAME)]))
  const openTasks = tasks
    .filter((task) => !task.done)
    .map(
      (task): AiContextTask => ({
        id: task.id,
        title: clip(task.title, MAX_TITLE),
        area: areaNameById.get(task.areaId) ?? '',
        due: task.due,
        priority: priorityOf(task),
      }),
    )
    .sort(compareUrgency)
    .slice(0, MAX_CONTEXT_TASKS)

  return {
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    weekday: WEEKDAYS[now.getDay()] as string,
    areas: [...areaNameById.values()].filter((name) => name !== '').slice(0, MAX_AREAS),
    openTasks,
  }
}
