/** Rings of the radar, nearest first. */
export const HORIZONS = ['today', 'week', 'month', 'later', 'someday'] as const
export type Horizon = (typeof HORIZONS)[number]

export const HORIZON_LABEL: Record<Horizon, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  later: 'Later',
  someday: 'Someday',
}

export type Effort = 's' | 'm' | 'l'

/** Rough minutes per effort size, used to compare estimate vs. actual in Focus. */
export const EFFORT_MINUTES: Record<Effort, number> = { s: 20, m: 60, l: 180 }

export const EFFORT_LABEL: Record<Effort, string> = { s: 'Quick', m: 'Medium', l: 'Big' }

/** Keys into the area color palette defined in CSS (`--area-<key>`). */
export const AREA_COLORS = ['indigo', 'magenta', 'teal', 'amber', 'violet', 'olive', 'sky', 'rose'] as const
export type AreaColor = (typeof AREA_COLORS)[number]

export interface Area {
  id: string
  name: string
  color: AreaColor
  /** Epoch ms of the last edit; used to merge synced copies (missing on old data = 0). */
  updatedAt?: number
}

/** Remembers a deletion so a sync merge doesn't resurrect the item from another device. */
export interface Tombstone {
  id: string
  kind: 'task' | 'area'
  /** Epoch ms. */
  at: number
}

export const REPEATS = ['none', 'daily', 'weekly', 'monthly'] as const
export type Repeat = (typeof REPEATS)[number]

export interface Step {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  notes: string
  areaId: string
  horizon: Horizon
  /** ISO date `YYYY-MM-DD`, local calendar day. */
  due: string | null
  high: boolean
  effort: Effort
  /** What this task is blocked on, e.g. "lottery registration opens". */
  waiting: string | null
  /** Implementation intention: when/where the user will do it. */
  plan: string | null
  steps: Step[]
  done: boolean
  /** Epoch ms. */
  doneAt: number | null
  createdAt: number
  updatedAt: number
  /** Minutes tracked in Focus. */
  spentMinutes: number
  /** When done, a repeating task schedules its next copy. Old data has no field = 'none'. */
  repeat?: Repeat
  /** Id of the task whose completion created this copy (lets "not done" withdraw it). */
  repeatOf?: string
  /** First due date of a monthly series, so month-end dates don't drift. */
  repeatAnchor?: string
}

/** Shape produced by importers and the quick-capture parser before ids/timestamps exist. */
export interface TaskDraft {
  title: string
  notes?: string
  /** Area name or id as written by the user; resolved against existing areas on commit. */
  area?: string
  horizon?: Horizon
  due?: string | null
  high?: boolean
  effort?: Effort
  waiting?: string | null
  plan?: string | null
  steps?: { title: string; done?: boolean }[]
  done?: boolean
  repeat?: Repeat
}

export interface ExportFile {
  app: 'nearer'
  version: 1
  exportedAt: string
  areas: Area[]
  tasks: Task[]
}
