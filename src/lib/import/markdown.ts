import type { TaskDraft } from '../../model/types'
import {
  MAX_AREA_HINT,
  MAX_STEP,
  MAX_TITLE,
  appendStep,
  droppedStepsWarning,
  clamp,
  collapseSpaces,
  isValidISODate,
  type ImportResult,
} from './shared'

const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s*)?(.*)$/
// Captures greedily and strips a closing "###" in code; a lazy group here backtracked quadratically.
const HEADING = /^ {0,3}#{1,6}[ \t]+(\S.*)$/
const CLOSING_HASHES = /[ \t]+#+$/
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const EXPORT_TITLE = /^(?:nearer|cairn) export\b/i

const DUE_EMOJI = /📅\s*(\d{4}-\d{2}-\d{2})/u
const HIGH_EMOJI = /[⏫🔺]/u
const OTHER_EMOJI = /(?:[⏳🛫✅➕❌]️?\s*\d{4}-\d{2}-\d{2}|🔁️?[^\p{Extended_Pictographic}]*|[🔼🔽⏬]️?)/gu
const TAB_WIDTH = 4

const indentWidth = (whitespace: string): number => whitespace.replace(/\t/g, ' '.repeat(TAB_WIDTH)).length

interface Parsed {
  title: string
  due?: string
  high: boolean
}

/** Strips Obsidian Tasks emoji metadata, reading due date (📅) and high priority (⏫ 🔺). */
function readEmoji(text: string): Parsed {
  const dueRaw = DUE_EMOJI.exec(text)?.[1]
  const cleaned = text
    .replace(DUE_EMOJI, ' ')
    .replace(OTHER_EMOJI, ' ')
    .replace(/[⏫🔺]️?/gu, ' ')
  return {
    title: collapseSpaces(cleaned),
    ...(dueRaw !== undefined && isValidISODate(dueRaw) && { due: dueRaw }),
    high: HIGH_EMOJI.test(text),
  }
}

const headingName = (raw: string): string => collapseSpaces(raw.replace(/[*_`]/g, ''))

function taskFrom(body: string, done: boolean, area: string | undefined): TaskDraft | null {
  const { title, due, high } = readEmoji(body)
  const clean = clamp(title, MAX_TITLE)
  if (clean === '') return null
  return {
    title: clean,
    ...(area !== undefined && { area }),
    ...(due !== undefined && { due }),
    ...(high && { high: true }),
    ...(done && { done: true }),
  }
}

export function parseMarkdown(text: string): ImportResult {
  const drafts: TaskDraft[] = []
  let area: string | undefined
  let taskIndent = 0
  let hasTask = false
  let ignored = 0
  let droppedSteps = 0

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || RULE.test(raw)) continue
    const heading = HEADING.exec(raw)?.[1]?.trimEnd().replace(CLOSING_HASHES, '').trimEnd()
    if (heading !== undefined) {
      if (!EXPORT_TITLE.test(heading)) area = clamp(headingName(heading), MAX_AREA_HINT) || undefined
      hasTask = false
      continue
    }
    const item = LIST_ITEM.exec(raw)
    if (item === null) {
      ignored += 1
      continue
    }
    const indent = indentWidth(item[1] ?? '')
    const done = item[2]?.toLowerCase() === 'x'
    if (hasTask && indent > taskIndent) {
      const step = readEmoji(item[3] ?? '').title
      const last = drafts.length - 1
      if (step === '' || last < 0) continue
      const next = appendStep(drafts[last]!, { title: clamp(step, MAX_STEP), done })
      if (next === null) droppedSteps += 1
      else drafts[last] = next
      continue
    }
    const task = taskFrom(item[3] ?? '', done, area)
    if (task === null) continue
    drafts.push(task)
    taskIndent = indent
    hasTask = true
  }
  const warnings = [
    ...(ignored > 0 ? [`Ignored ${ignored} line${ignored === 1 ? '' : 's'} that were not list items.`] : []),
    ...droppedStepsWarning(droppedSteps),
  ]
  return { drafts, warnings }
}
