import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { formatDue } from '../lib/dates'
import { newId } from '../lib/ids'
import { DEFAULT_AREAS, MAX_AREAS } from '../model/defaults'
import { nextOccurrence } from '../model/repeat'
import { AREA_COLORS, type Area, type AreaColor, type Horizon, type Task, type TaskDraft, type Tombstone } from '../model/types'
import { draftToTask } from './build'
import { createDebouncedIdbStorage, requestPersistentStorage } from './persist'
import { DEFAULT_PREFS, sanitizePersisted, type PersistedState, type Prefs } from './schema'

export type View = 'radar' | 'map' | 'list' | 'focus' | 'reset'
export const VIEWS: readonly View[] = ['radar', 'map', 'list', 'focus', 'reset']

export interface Toast {
  id: string
  message: string
  undoable: boolean
  /** Stays until dismissed (used for errors the user must not miss). */
  sticky?: boolean
}

interface Snapshot {
  areas: Area[]
  tasks: Task[]
  tombstones: Tombstone[]
  hiddenAreas: string[]
  /** The toast that offers this undo; once it is gone the snapshot is stale. */
  toastId: string
}

export interface DraftWithArea {
  draft: TaskDraft
  areaId: string
}

export type SyncStatus = 'off' | 'signed-out' | 'locked' | 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncInfo {
  status: SyncStatus
  email: string | null
  lastSyncedAt: number | null
  message: string | null
  /** Whether the signed-in account already has an encrypted vault (decides create vs. unlock). */
  vault: 'unknown' | 'missing' | 'present'
}

interface UiState {
  hydrated: boolean
  /** Saved data couldn't be read; writes are blocked so it isn't overwritten. */
  storageBlocked: boolean
  view: View
  selectedId: string | null
  toast: Toast | null
  undoSnapshot: Snapshot | null
  /** Bumped when a task is completed so the radar can play its ripple. */
  lastCompleted: { id: string; areaId: string; at: number } | null
  importOpen: boolean
  settingsOpen: boolean
  /** The "new area" dialog, reachable from the rail, radar, map and list. */
  newAreaOpen: boolean
  accountOpen: boolean
  /** Task pinned in Focus; null means "whatever is nearest". */
  focusTaskId: string | null
  sync: SyncInfo
}

interface Actions {
  addTask: (draft: TaskDraft, areaId: string, fallback?: Horizon) => string
  addTasks: (items: DraftWithArea[], options?: { replace?: boolean; newAreas?: Area[] }) => number
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>) => void
  moveTask: (id: string, to: { horizon?: Horizon; areaId?: string }, label?: string) => void
  setDone: (id: string, done: boolean) => void
  deleteTask: (id: string) => void
  addStep: (taskId: string, title: string) => void
  updateStep: (taskId: string, stepId: string, patch: { title?: string; done?: boolean }) => void
  deleteStep: (taskId: string, stepId: string) => void
  addArea: (name: string, color?: AreaColor) => string | null
  updateArea: (id: string, patch: Partial<Omit<Area, 'id' | 'updatedAt'>>) => void
  deleteArea: (id: string, moveTasksTo: string) => void
  clearEverything: () => void
  /** Replaces data with a merged copy from sync: no undo, no timestamp changes. */
  applySynced: (doc: { areas: Area[]; tasks: Task[]; tombstones: Tombstone[] }) => void
  setSync: (patch: Partial<SyncInfo>) => void
  undo: () => void
  showToast: (message: string, undoable?: boolean, sticky?: boolean) => void
  dismissToast: () => void
  setView: (view: View) => void
  select: (id: string | null) => void
  setPrefs: (patch: Partial<Prefs>) => void
  setImportOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setNewAreaOpen: (open: boolean) => void
  setAccountOpen: (open: boolean) => void
  startFocus: (id: string | null) => void
}

export type StoreState = PersistedState & UiState & Actions

const STORAGE_KEY = 'nearer-state'
const SCHEMA_VERSION = 1

const touch = (task: Task, patch: Partial<Task>): Task => ({ ...task, ...patch, updatedAt: Date.now() })
const tomb = (id: string, kind: Tombstone['kind']): Tombstone => ({ id, kind, at: Date.now() })

/** Assigned once the store exists; referencing the store inside its own config would break inference. */
let canPersist = (): boolean => false

/** Starting view from the URL hash, so a reload on #list doesn't push a bogus #radar entry. */
function initialView(): View {
  if (typeof location === 'undefined') return 'radar'
  const fromHash = location.hash.replace('#', '') as View
  return VIEWS.includes(fromHash) ? fromHash : 'radar'
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      /**
       * Runs a destructive change and offers to undo it from a toast. The snapshot is only
       * valid while that toast is showing and nothing else has changed since.
       */
      const withUndo = (message: string, change: () => void): void => {
        const { areas, tasks, tombstones, prefs } = get()
        const toastId = newId()
        change()
        set({
          undoSnapshot: { areas, tasks, tombstones, hiddenAreas: prefs.hiddenAreas, toastId },
          toast: { id: toastId, message, undoable: true },
        })
      }
      /** Any ordinary edit makes an older undo snapshot unsafe to restore. */
      const invalidateUndo = (): Partial<UiState> =>
        get().undoSnapshot ? { undoSnapshot: null, toast: get().toast?.undoable ? null : get().toast } : {}
      const mapTask = (id: string, fn: (t: Task) => Task): void => {
        set((s) => ({ ...invalidateUndo(), tasks: s.tasks.map((t) => (t.id === id ? fn(t) : t)) }))
      }
      /** Showing an area again when the user adds work to it, so new tasks never vanish. */
      const unhide = (prefs: Prefs, areaIds: string[]): Prefs => ({
        ...prefs,
        onboarded: true,
        hiddenAreas: prefs.hiddenAreas.filter((h) => !areaIds.includes(h)),
      })

      return {
        areas: DEFAULT_AREAS.map((a) => ({ ...a })),
        tasks: [],
        tombstones: [],
        prefs: DEFAULT_PREFS,
        hydrated: false,
        storageBlocked: false,
        view: initialView(),
        selectedId: null,
        toast: null,
        undoSnapshot: null,
        lastCompleted: null,
        importOpen: false,
        settingsOpen: false,
        newAreaOpen: false,
        accountOpen: false,
        focusTaskId: null,
        sync: { status: 'off', email: null, lastSyncedAt: null, message: null, vault: 'unknown' },

        addTask: (draft, areaId, fallback = 'week') => {
          const task = draftToTask(draft, areaId, new Date(), fallback)
          set((s) => ({ ...invalidateUndo(), tasks: [...s.tasks, task], prefs: unhide(s.prefs, [areaId]) }))
          void requestPersistentStorage()
          return task.id
        },

        addTasks: (items, options = {}) => {
          const now = new Date()
          const created = items.map(({ draft, areaId }) => draftToTask(draft, areaId, now, 'later'))
          withUndo(`Added ${created.length} ${created.length === 1 ? 'task' : 'tasks'}`, () =>
            set((s) => ({
              // Replacing clears tasks only; areas stay because the incoming rows already point at them.
              areas: [...s.areas, ...(options.newAreas ?? []).map((a) => ({ ...a, updatedAt: Date.now() }))]
                .filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i)
                .slice(0, MAX_AREAS),
              tasks: [...(options.replace ? [] : s.tasks), ...created],
              tombstones: options.replace ? [...s.tombstones, ...s.tasks.map((t) => tomb(t.id, 'task'))] : s.tombstones,
              prefs: unhide(s.prefs, created.map((t) => t.areaId)),
            })),
          )
          void requestPersistentStorage()
          return created.length
        },

        updateTask: (id, patch) => mapTask(id, (t) => touch(t, patch)),

        moveTask: (id, to, label) => {
          const task = get().tasks.find((t) => t.id === id)
          if (!task) return
          const same = (to.horizon ?? task.horizon) === task.horizon && (to.areaId ?? task.areaId) === task.areaId
          if (same) return
          withUndo(label ?? 'Moved', () => mapTask(id, (t) => touch(t, to)))
        },

        setDone: (id, done) => {
          const task = get().tasks.find((t) => t.id === id)
          if (!task || task.done === done) return
          const now = new Date()
          const next = done ? nextOccurrence(task, now, newId) : null
          const message = !done
            ? 'Marked as not done'
            : next?.due
              ? `Done. Next one is due ${formatDue(next.due, now)}`
              : `Done: ${task.title}`
          withUndo(message, () => {
            mapTask(id, (t) => touch(t, { done, doneAt: done ? Date.now() : null }))
            if (next) set((s) => ({ tasks: [...s.tasks, next] }))
          })
          if (done) set({ lastCompleted: { id, areaId: task.areaId, at: Date.now() } })
        },

        deleteTask: (id) => {
          const task = get().tasks.find((t) => t.id === id)
          if (!task) return
          withUndo(`Deleted "${task.title}"`, () =>
            set((s) => ({
              tasks: s.tasks.filter((t) => t.id !== id),
              tombstones: [...s.tombstones, tomb(id, 'task')],
              selectedId: s.selectedId === id ? null : s.selectedId,
            })),
          )
        },

        addStep: (taskId, title) => {
          const clean = title.trim().slice(0, 300)
          if (!clean) return
          mapTask(taskId, (t) => touch(t, { steps: [...t.steps, { id: newId(), title: clean, done: false }] }))
        },

        updateStep: (taskId, stepId, patch) =>
          mapTask(taskId, (t) =>
            touch(t, { steps: t.steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st)) }),
          ),

        deleteStep: (taskId, stepId) =>
          mapTask(taskId, (t) => touch(t, { steps: t.steps.filter((st) => st.id !== stepId) })),

        addArea: (name, color) => {
          const clean = name.trim().slice(0, 40)
          const { areas } = get()
          if (!clean || areas.length >= MAX_AREAS) return null
          const existing = areas.find((a) => a.name.toLowerCase() === clean.toLowerCase())
          if (existing) return existing.id
          const used = new Set(areas.map((a) => a.color))
          const pick = color ?? AREA_COLORS.find((c) => !used.has(c)) ?? AREA_COLORS[areas.length % AREA_COLORS.length]
          const area: Area = { id: newId(), name: clean, color: pick, updatedAt: Date.now() }
          set((s) => ({ ...invalidateUndo(), areas: [...areas, area], prefs: unhide(s.prefs, [area.id]) }))
          return area.id
        },

        updateArea: (id, patch) =>
          set((s) => ({
            ...invalidateUndo(),
            areas: s.areas.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)),
          })),

        deleteArea: (id, moveTasksTo) => {
          const { areas } = get()
          const area = areas.find((a) => a.id === id)
          const targetExists = areas.some((a) => a.id === moveTasksTo)
          if (!area || areas.length <= 1 || id === moveTasksTo || !targetExists) return
          withUndo(`Removed area "${area.name}"`, () =>
            set((s) => ({
              areas: s.areas.filter((a) => a.id !== id),
              tasks: s.tasks.map((t) => (t.areaId === id ? touch(t, { areaId: moveTasksTo }) : t)),
              tombstones: [...s.tombstones, tomb(id, 'area')],
              prefs: { ...s.prefs, hiddenAreas: s.prefs.hiddenAreas.filter((h) => h !== id) },
            })),
          )
        },

        clearEverything: () =>
          withUndo('Cleared all tasks', () =>
            set((s) => ({
              tasks: [],
              tombstones: [...s.tombstones, ...s.tasks.map((t) => tomb(t.id, 'task'))],
              selectedId: null,
              focusTaskId: null,
              prefs: { ...s.prefs, hiddenAreas: [] },
            })),
          ),

        applySynced: (doc) =>
          set((s) => ({
            ...invalidateUndo(),
            areas: doc.areas.length > 0 ? doc.areas : s.areas,
            tasks: doc.tasks,
            tombstones: doc.tombstones,
            selectedId: doc.tasks.some((t) => t.id === s.selectedId) ? s.selectedId : null,
          })),

        setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),

        undo: () => {
          const { undoSnapshot: snap, toast } = get()
          if (!snap || toast?.id !== snap.toastId) return
          // Undoing must also count as a new edit for sync, so re-stamp what it brings back.
          const now = Date.now()
          const current = new Map(get().tasks.map((t) => [t.id, t]))
          set((s) => ({
            areas: snap.areas.map((a) => ({ ...a, updatedAt: now })),
            tasks: snap.tasks.map((t) => (current.get(t.id) === t ? t : { ...t, updatedAt: now })),
            tombstones: snap.tombstones,
            prefs: { ...s.prefs, hiddenAreas: snap.hiddenAreas },
            undoSnapshot: null,
            toast: null,
            lastCompleted: null,
          }))
        },

        showToast: (message, undoable = false, sticky = false) =>
          set({ toast: { id: newId(), message, undoable, sticky } }),
        dismissToast: () => set({ toast: null, undoSnapshot: null }),
        setView: (view) => set({ view }),
        select: (id) => set({ selectedId: id }),
        setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
        setImportOpen: (open) => set({ importOpen: open }),
        setSettingsOpen: (open) => set({ settingsOpen: open }),
        setNewAreaOpen: (open) => set({ newAreaOpen: open }),
        setAccountOpen: (open) => set({ accountOpen: open }),
        startFocus: (id) => set({ focusTaskId: id, view: 'focus', selectedId: null }),
      }
    },
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      // Never write before saved data has loaded (or after loading failed), or it would be overwritten.
      storage: createJSONStorage(() => createDebouncedIdbStorage(() => canPersist())),
      partialize: (s): PersistedState => ({ areas: s.areas, tasks: s.tasks, tombstones: s.tombstones, prefs: s.prefs }),
      // Future schema changes upgrade `persisted` step by step here; v1 only needs validation.
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
      onRehydrateStorage: () => (_state, error) => {
        if (!error) {
          useStore.setState({ hydrated: true })
          return
        }
        useStore.setState({
          hydrated: true,
          storageBlocked: true,
          toast: {
            id: newId(),
            message: "Couldn't load your saved tasks. Changes in this tab won't be saved — reload to try again.",
            undoable: false,
            sticky: true,
          },
        })
      },
    },
  ),
)

canPersist = () => useStore.persist.hasHydrated() && !useStore.getState().storageBlocked
