import type { Area } from '../../model/types'

/** The six default areas, with stable ids, as the store seeds them. */
export const DEFAULT_AREAS: Area[] = [
  { id: 'classes', name: 'Classes', color: 'indigo' },
  { id: 'orgs', name: 'Orgs', color: 'magenta' },
  { id: 'career', name: 'Career', color: 'teal' },
  { id: 'projects', name: 'Projects', color: 'amber' },
  { id: 'learning', name: 'Learning', color: 'violet' },
  { id: 'life', name: 'Life', color: 'olive' },
]

/** Wednesday, 2026-10-21, mid-afternoon local time. */
export const NOW = new Date(2026, 9, 21, 15, 30)
