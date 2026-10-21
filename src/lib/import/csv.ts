import type { TaskDraft } from '../../model/types'
import {
  MAX_AREA_HINT,
  MAX_NOTES,
  MAX_STEP,
  MAX_TITLE,
  appendStep,
  droppedStepsWarning,
  clamp,
  isHighPriority,
  isTruthy,
  normalizeDue,
  type ImportResult,
} from './shared'

/** Todoist's CSV export marks p1 (highest) as PRIORITY 4. */
const TODOIST_HIGH_PRIORITY = '4'

const TITLE_COLUMNS = ['title', 'task', 'name', 'content'] as const
const AREA_COLUMNS = ['area', 'category', 'list', 'project'] as const
const DUE_COLUMNS = ['due', 'date', 'deadline', 'duedate'] as const
const NOTES_COLUMNS = ['notes', 'description'] as const
const DONE_COLUMNS = ['done', 'completed'] as const

/** RFC 4180 parser: quoted fields, escaped quotes, embedded newlines, CRLF. Returns raw rows. */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let touched = false

  const endField = (): void => {
    row.push(field)
    field = ''
  }
  const endRow = (): void => {
    endField()
    rows.push(row)
    row = []
    touched = false
  }

  for (let i = 0; i < source.length; i += 1) {
    const ch = source.charAt(i)
    if (quoted) {
      if (ch !== '"') field += ch
      else if (source.charAt(i + 1) === '"') {
        field += '"'
        i += 1
      } else quoted = false
      continue
    }
    touched = true
    if (ch === '"' && field === '') quoted = true
    else if (ch === ',') endField()
    else if (ch === '\n') endRow()
    else if (ch === '\r') {
      if (source.charAt(i + 1) === '\n') i += 1
      endRow()
    } else field += ch
  }
  if (touched || field !== '' || row.length > 0) endRow()
  return rows
}

/** Lower-cased header name -> column index. */
function indexHeader(header: string[]): Map<string, number> {
  const index = new Map<string, number>()
  header.forEach((name, i) => {
    const key = name.trim().toLowerCase().replace(/[\s_-]+/g, '')
    if (!index.has(key)) index.set(key, i)
  })
  return index
}

type Reader = (names: readonly string[]) => string

function makeReader(row: string[], columns: Map<string, number>): Reader {
  return (names) => {
    for (const name of names) {
      const col = columns.get(name)
      const value = col === undefined ? undefined : row[col]?.trim()
      if (value) return value
    }
    return ''
  }
}

function genericDraft(read: Reader, now: Date): TaskDraft | null {
  const title = clamp(read(TITLE_COLUMNS), MAX_TITLE)
  if (title === '') return null
  const area = clamp(read(AREA_COLUMNS), MAX_AREA_HINT)
  const notes = clamp(read(NOTES_COLUMNS), MAX_NOTES)
  const due = normalizeDue(read(DUE_COLUMNS), now)
  return {
    title,
    ...(area !== '' && { area }),
    ...(due !== undefined && { due }),
    ...(notes !== '' && { notes }),
    ...(isHighPriority(read(['priority'])) && { high: true }),
    ...(isTruthy(read(DONE_COLUMNS)) && { done: true }),
  }
}

function parseGeneric(rows: string[][], columns: Map<string, number>, now: Date): TaskDraft[] {
  return rows.flatMap((row) => {
    const draft = genericDraft(makeReader(row, columns), now)
    return draft === null ? [] : [draft]
  })
}

function parseTodoist(
  rows: string[][],
  columns: Map<string, number>,
  now: Date,
): { drafts: TaskDraft[]; dropped: number } {
  const drafts: TaskDraft[] = []
  let section: string | undefined
  let dropped = 0
  for (const row of rows) {
    const read = makeReader(row, columns)
    const type = read(['type']).toLowerCase()
    const content = read(['content'])
    if (content === '') continue
    if (type === 'section') {
      section = clamp(content, MAX_AREA_HINT)
      continue
    }
    if (type !== 'task') continue
    const indent = Number(read(['indent'])) || 1
    const last = drafts.length - 1
    if (indent >= 2 && last >= 0) {
      const next = appendStep(drafts[last]!, { title: clamp(content, MAX_STEP), done: false })
      if (next === null) dropped += 1
      else drafts[last] = next
      continue
    }
    const due = normalizeDue(read(['date']), now)
    const notes = clamp(read(['description']), MAX_NOTES)
    drafts.push({
      title: clamp(content, MAX_TITLE),
      ...(section !== undefined && { area: section }),
      ...(notes !== '' && { notes }),
      ...(read(['priority']) === TODOIST_HIGH_PRIORITY && { high: true }),
      ...(due !== undefined && { due }),
    })
  }
  return { drafts, dropped }
}

export function parseCsvImport(text: string, now: Date): ImportResult {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ''))
  const header = rows[0]
  if (header === undefined) throw new Error('This CSV file is empty.')
  const columns = indexHeader(header)
  if (!TITLE_COLUMNS.some((name) => columns.has(name))) {
    throw new Error('This CSV needs a header row with a "title" or "content" column.')
  }
  const body = rows.slice(1)
  const todoist = columns.has('type') && columns.has('content')
  if (!todoist) return { drafts: parseGeneric(body, columns, now), warnings: [] }
  const { drafts, dropped } = parseTodoist(body, columns, now)
  return { drafts, warnings: droppedStepsWarning(dropped) }
}
