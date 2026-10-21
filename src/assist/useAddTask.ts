import { useCallback } from 'react'
import { parseCapture } from '../lib/capture'
import { resolveArea } from '../lib/classify'
import type { Area } from '../model/types'
import { useStore } from '../store/useStore'
import { enrichWithAssistant } from './enrich'

export interface CapturePreview {
  title: string
  areaId: string
  guessed: boolean
  due: string | null
  high: boolean
}

/** What a typed line will become, without saving it (for the live preview under the input). */
export function previewCapture(text: string, forcedAreaId: string | null, areas: Area[]): CapturePreview | null {
  if (!text.trim()) return null
  const { draft } = parseCapture(text, areas, new Date())
  const resolved = resolveArea(draft.area, draft.title, areas)
  const areaId = forcedAreaId && areas.some((a) => a.id === forcedAreaId) ? forcedAreaId : resolved.areaId
  return {
    title: draft.title,
    areaId,
    guessed: !forcedAreaId && resolved.guessed,
    due: draft.due ?? null,
    high: Boolean(draft.high),
  }
}

/**
 * One way to add a task everywhere: parse the line locally (area, date, priority), save it
 * immediately, then — if the assistant is on — let it fill in steps, dates and order in the
 * background. Capture never asks the user a question.
 */
export function useAddTask(): (text: string, forcedAreaId?: string | null) => string | null {
  const addTask = useStore((s) => s.addTask)
  return useCallback(
    (text: string, forcedAreaId: string | null = null) => {
      const { areas } = useStore.getState()
      const preview = previewCapture(text, forcedAreaId, areas)
      if (!preview || !preview.title.trim()) return null
      const { draft } = parseCapture(text, areas, new Date())
      const id = addTask({ ...draft, area: undefined }, preview.areaId, 'week')
      void enrichWithAssistant(id, text, forcedAreaId !== null)
      return id
    },
    [addTask],
  )
}
