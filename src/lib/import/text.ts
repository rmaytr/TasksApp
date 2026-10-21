import type { TaskDraft } from '../../model/types'
import { extractCapture } from '../capture'
import {
  MAX_STEP,
  MAX_STEPS,
  appendStep,
  droppedStepsWarning,
  MAX_TITLE,
  capitalize,
  clamp,
  stripTrailingPeriod,
  type ImportResult,
} from './shared'

const MAX_HEADING_LENGTH = 40
const MAX_LIST_PIECE_LENGTH = 60

const INDENTED = /^(?:\t| {2,})/
const LIST_MARKER = /^(?:\d+[.)]|[-*•])\s+/
const CHECKBOX = /^\[([ xX]?)\]\s+/
const LETTER_BULLET = /^[a-zA-Z][.)]\s+/

interface Line {
  body: string
  indented: boolean
  letterBullet: boolean
  done: boolean
}

function readLine(raw: string): Line {
  let body = raw.trim()
  let letterBullet = false
  let done = false
  const marker = LIST_MARKER.exec(body)
  if (marker) {
    body = body.slice(marker[0].length)
  } else if (LETTER_BULLET.test(body)) {
    letterBullet = true
    body = body.replace(LETTER_BULLET, '')
  }
  const box = CHECKBOX.exec(body)
  if (box) {
    done = box[1]?.toLowerCase() === 'x'
    body = body.slice(box[0].length)
  }
  return { body: body.trim(), indented: INDENTED.test(raw), letterBullet, done }
}

function splitList(rest: string): string[] {
  if (rest.includes(',')) return rest.split(/\s*,\s*(?:and\s+)?/i)
  const halves = rest.split(/\s+and\s+/i)
  const bothMultiWord = halves.length === 2 && halves.every((h) => h.trim().split(/\s+/).length >= 2)
  return bothMultiWord ? halves : [rest]
}

/** "Title: a, b, and c" -> title + steps. Colons in times/URLs have no following space and never split. */
export function splitTitleSteps(title: string): { title: string; steps: string[] } {
  const colon = /:\s/.exec(title)
  if (colon === null || colon.index === 0) return { title, steps: [] }
  const head = title.slice(0, colon.index).trim()
  const pieces = splitList(title.slice(colon.index + 1).trim())
    .map((p) => stripTrailingPeriod(p.trim()))
    .filter((p) => p !== '')
  const usable = pieces.length >= 2 && pieces.every((p) => p.length <= MAX_LIST_PIECE_LENGTH)
  return usable ? { title: head, steps: pieces } : { title, steps: [] }
}

const stepOf = (text: string, done: boolean): { title: string; done: boolean } => ({
  title: clamp(capitalize(stripTrailingPeriod(text)), MAX_STEP),
  done,
})

function buildTask(line: Line, heading: string | undefined, now: Date): TaskDraft | null {
  const { draft } = extractCapture(line.body, now, (hint) => hint)
  const { title, steps } = splitTitleSteps(stripTrailingPeriod(draft.title))
  const cleanTitle = clamp(title, MAX_TITLE)
  if (cleanTitle === '') return null
  const area = draft.area ?? heading
  return {
    ...draft,
    title: cleanTitle,
    ...(area !== undefined && { area }),
    ...(line.done && { done: true }),
    ...(steps.length > 0 && { steps: steps.slice(0, MAX_STEPS).map((s) => stepOf(s, false)) }),
  }
}

/** A short line ending in ":" with nothing after it names the area of the items below. */
function headingOf(line: Line): string | undefined {
  if (line.indented || !line.body.endsWith(':') || line.body.length > MAX_HEADING_LENGTH) return undefined
  const name = line.body.slice(0, -1).trim()
  return name === '' ? undefined : name
}

export function parseText(text: string, now: Date): ImportResult {
  const drafts: TaskDraft[] = []
  const warnings: string[] = []
  let heading: string | undefined
  let skipped = 0
  let droppedSteps = 0
  let stepTarget = -1 // index of the task that indented lines attach to

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue
    const line = readLine(raw)
    if (line.body === '') continue
    if ((line.indented || line.letterBullet) && stepTarget >= 0) {
      const next = appendStep(drafts[stepTarget]!, stepOf(line.body, line.done))
      if (next === null) droppedSteps += 1
      else drafts[stepTarget] = next
      continue
    }
    const newHeading = headingOf(line)
    if (newHeading !== undefined) {
      heading = newHeading
      stepTarget = -1
      continue
    }
    const task = buildTask(line, heading, now)
    if (task === null) {
      skipped += 1
    } else {
      drafts.push(task)
      stepTarget = drafts.length - 1
    }
  }
  if (skipped > 0) warnings.push(`Skipped ${skipped} line${skipped === 1 ? '' : 's'} with no task text.`)
  warnings.push(...droppedStepsWarning(droppedSteps))
  return { drafts, warnings }
}
