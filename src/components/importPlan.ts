import { resolveArea } from '../lib/classify'
import { newId } from '../lib/ids'
import { MAX_AREAS } from '../model/defaults'
import { AREA_COLORS, type Area, type TaskDraft } from '../model/types'

export interface PreviewRow {
  key: string
  draft: TaskDraft
  areaId: string
  guessed: boolean
  include: boolean
}

export interface ImportPlan {
  rows: PreviewRow[]
  newAreas: Area[]
}

/**
 * Resolves each draft's area. Area names the user wrote that match nothing
 * (e.g. a "## Gym" heading) become new areas while there is room.
 */
export function planImport(drafts: readonly TaskDraft[], areas: readonly Area[]): ImportPlan {
  const room = MAX_AREAS - areas.length
  const newAreas: Area[] = []
  const used = new Set(areas.map((a) => a.color))

  const rows = drafts.map((draft, i): PreviewRow => {
    const hint = draft.area?.trim()
    const known = [...areas, ...newAreas]
    const resolved = resolveArea(hint, `${draft.title} ${draft.notes ?? ''}`, known)
    if (hint && resolved.guessed && newAreas.length < room) {
      const color = AREA_COLORS.find((c) => !used.has(c)) ?? AREA_COLORS[(areas.length + newAreas.length) % AREA_COLORS.length]
      used.add(color)
      const area: Area = { id: newId(), name: hint.slice(0, 40), color }
      newAreas.push(area)
      return { key: String(i), draft, areaId: area.id, guessed: false, include: true }
    }
    return { key: String(i), draft, areaId: resolved.areaId, guessed: resolved.guessed, include: true }
  })
  return { rows, newAreas }
}

export const MAX_IMPORT_BYTES = 2_000_000
