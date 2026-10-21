import type { Area, ExportFile, Step, Task } from '../model/types'
import { toISODate } from './dates'

const FALLBACK_SECTION = 'Other'
const TITLE_PREFIX = '# Nearer export — '

/** Snapshot of everything, copied so later edits to the store cannot leak into it. */
export function toExportFile(areas: Area[], tasks: Task[], now: Date): ExportFile {
  return {
    app: 'nearer',
    version: 1,
    exportedAt: now.toISOString(),
    areas: areas.map((a) => ({ ...a })),
    tasks: tasks.map((t) => ({ ...t, steps: t.steps.map((s) => ({ ...s })) })),
  }
}

/** Pretty-printed lossless backup. */
export function toJSON(areas: Area[], tasks: Task[], now: Date): string {
  return JSON.stringify(toExportFile(areas, tasks, now), null, 2)
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

const checkbox = (done: boolean): string => (done ? '[x]' : '[ ]')

function stepLine(step: Step): string {
  return `  - ${checkbox(step.done)} ${oneLine(step.title)}`
}

function taskLines(task: Task): string[] {
  const suffix = [task.due ? `📅 ${task.due}` : '', task.high ? '⏫' : ''].filter((s) => s !== '')
  const head = [`- ${checkbox(task.done)} ${oneLine(task.title)}`, ...suffix].join(' ')
  return [head, ...task.steps.map(stepLine)]
}

function section(name: string, tasks: Task[]): string[] {
  return ['', `## ${oneLine(name)}`, '', ...tasks.flatMap(taskLines)]
}

/** Readable export, importable again by the markdown importer. */
export function toMarkdown(areas: Area[], tasks: Task[], now: Date): string {
  const known = new Set(areas.map((a) => a.id))
  const lines = [
    `${TITLE_PREFIX}${toISODate(now)}`,
    ...areas.flatMap((a) =>
      section(
        a.name,
        tasks.filter((t) => t.areaId === a.id),
      ),
    ),
  ]
  const orphans = tasks.filter((t) => !known.has(t.areaId))
  if (orphans.length > 0) lines.push(...section(FALLBACK_SECTION, orphans))
  return `${lines.join('\n')}\n`
}
