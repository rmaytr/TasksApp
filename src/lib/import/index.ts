import type { TaskDraft } from '../../model/types'
import { parseCsvImport } from './csv'
import { parseJson } from './json'
import { MAX_LINE_CHARS } from '../capture'
import { parseMarkdown } from './markdown'
import { parseText } from './text'

export type ImportFormat = 'text' | 'markdown' | 'json' | 'csv'

export const MAX_IMPORT_CHARS = 2_000_000
export const MAX_IMPORT_TASKS = 1000

const KNOWN_CSV_HEADERS = new Set([
  'title', 'task', 'name', 'content', 'area', 'category', 'list', 'project',
  'due', 'date', 'deadline', 'notes', 'description', 'priority', 'type', 'indent', 'done', 'completed',
])

const EXTENSION_FORMATS: Record<string, ImportFormat> = {
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  csv: 'csv',
  txt: 'text',
}

const looksLikeJson = (text: string): boolean =>
  text.startsWith('{') ||
  (/^\[\s*(?:[{["\]\d]|true|false|null)/.test(text) && !/^\[[ xX]?\]\s+\S/.test(text))

const looksLikeMarkdown = (text: string): boolean =>
  /^\s*[-*+]\s+\[[ xX]\]/m.test(text) || /^ {0,3}#{1,6}\s+\S/m.test(text)

function looksLikeCsv(text: string): boolean {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const cells = firstLine.split(',')
  const known = cells.filter((c) => KNOWN_CSV_HEADERS.has(c.trim().toLowerCase().replace(/[\s_-]+/g, ''))).length
  const commas = cells.length - 1
  return (commas >= 2 && known >= 1) || (commas >= 1 && known >= 2)
}

function formatFromExtension(filename: string | undefined): ImportFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(filename?.trim() ?? '')?.[1]?.toLowerCase()
  return ext === undefined ? null : (EXTENSION_FORMATS[ext] ?? null)
}

/** Extension first, then a sniff of the content; plain text is the fallback. */
export function detectFormat(text: string, filename?: string): ImportFormat {
  const byExtension = formatFromExtension(filename)
  if (byExtension !== null) return byExtension
  const trimmed = text.replace(/^﻿/, '').trim()
  if (looksLikeJson(trimmed)) return 'json'
  if (looksLikeMarkdown(trimmed)) return 'markdown'
  if (looksLikeCsv(trimmed)) return 'csv'
  return 'text'
}

function parseAs(format: ImportFormat, text: string, now: Date): { drafts: TaskDraft[]; warnings: string[] } {
  switch (format) {
    case 'json':
      return parseJson(text, now)
    case 'csv':
      return parseCsvImport(text, now)
    case 'markdown':
      return parseMarkdown(text)
    case 'text':
      return parseText(text, now)
  }
}

/**
 * Parses pasted text or a file's contents into task drafts. Throws an Error with a
 * user-facing message for oversized input or unparseable JSON/CSV; per-item
 * problems become warnings instead.
 */
export function parseImport(
  text: string,
  now: Date,
  filename?: string,
): { format: ImportFormat; drafts: TaskDraft[]; warnings: string[] } {
  if (text.length > MAX_IMPORT_CHARS) {
    throw new Error('That file is too large to import (the limit is 2,000,000 characters).')
  }
  const source = text.replace(/^﻿/, '')
  const format = detectFormat(source, filename)
  // Line-based formats get each line capped first, so no single crafted line can stall a regex.
  const lineSafe =
    format === 'text' || format === 'markdown'
      ? source
          .split('\n')
          .map((line) => line.slice(0, MAX_LINE_CHARS))
          .join('\n')
      : source
  const parsed = parseAs(format, lineSafe, now)
  const warnings = [...parsed.warnings]
  if (parsed.drafts.length > MAX_IMPORT_TASKS) {
    warnings.push(`Only the first ${MAX_IMPORT_TASKS} of ${parsed.drafts.length} tasks will be imported.`)
  }
  const drafts = parsed.drafts.slice(0, MAX_IMPORT_TASKS)
  if (drafts.length === 0 && warnings.length === 0) warnings.push('No tasks were found to import.')
  return { format, drafts, warnings }
}
