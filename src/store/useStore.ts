import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { formatDue } from '../lib/dates'
import { newId } from '../lib/ids'
import { DEFAULT_AREAS, MAX_AREAS } from '../model/defaults'
import { nextOccurrence } from '../model/repeat'
import { AREA_COLORS, type Area, type AreaColor, type Horizon, type Task, type TaskDraft, type Tombstone } from '../model/types'
import { parseHash, routeToHash, type Route, type TasksMode, type View } from '../route'
import { wouldCreateCycle } from '../plan/order'
import { draftToTask } from './build'
import { createDebouncedIdbStorage, requestPersistentStorage } from './persist'
import { DEFAULT_PREFS, sanitizePersisted, type PersistedState, type Prefs } from './schema'

export type { TasksMode, View } from '../route'

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

/** One assistant result, applied to a captured task as a single undoable change. */
export interface AssistPatch {
  taskId: string
  patch: Partial<Pick<Task, 'title' | 'areaId' | 'due' | 'horizon' | 'high' | 'low' | 'effort' | 'notes' | 'waiting' | 'after'>>
  steps: string[]
  /** Existing tasks that should now wait for this one. */
  blocks: string[]
  /** Further tasks the assistant split out of the same text. */
  extras: TaskDraft[]
  message: string
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
  /** List, Map or Radar inside the Tasks view. */
  tasksMode: TasksMode
  /** Area page: Tasks filtered to one area. */
  areaFilter: string | null
  /** The global "Add a task" sheet (Home has its own inline capture). */
  quickAddOpen: boolean
  /** Tasks the assistant is still sorting (shows a small sparkle on them). */
  assistBusy: string[]
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
  quickFindOpen: boolean
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
  /** Removes everything from this device (sign-out on a shared computer). No undo, no tombstones. */
  wipeLocal: () => void
  /** Replaces data with a merged copy from sync: no undo, no timestamp changes. */
  applySynced: (doc: { areas: Area[]; tasks: Task[]; tombstones: Tombstone[] }) => void
  setSync: (patch: Partial<SyncInfo>) => void
  undo: () => void
  showToast: (message: string, undoable?: boolean, sticky?: boolean) => void
  dismissToast: () => void
  setView: (view: View) => void
  /** Go anywhere: e.g. `navigate({ view: 'tasks', area: id })`. */
  navigate: (to: Partial<Route>) => void
  setQuickAddOpen: (open: boolean) => void
  setAssistBusy: (taskId: string, busy: boolean) => void
  applyAssist: (result: AssistPatch) => void
  /** Adds "do after" links suggested by Plan my day (skips any that would form a loop). */
  addDependencies: (edges: { taskId: string; after: string[] }[]) => void
  select: (id: string | null) => void
  setPrefs: (patch: Partial<Prefs>) => void
  setImportOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setNewAreaOpen: (open: boolean) => void
  setAccountOpen: (open: boolean) => void
  setQuickFindOpen: (open: boolean) => void
  startFocus: (id: string | null) => void
}

export type StoreState = PersistedState & UiState & Actions

const STORAGE_KEY = 'nearer-state'
const SCHEMA_VERSION = 1

const touch = (task: Task, patch: Partial<Task>): Task => ({ ...task, ...patch, updatedAt: Date.now() })

/** One captured task may make at most this many existing tasks wait for it. */
const MAX_ASSIST_BLOCKS = 5

/** Adds "taskId comes after `after`" unless it already exists or would close a loop. */
function linkIfAcyclic(tasks: Task[], edge: { taskId: string; after: string }): Task[] {
  const target = tasks.find((t) => t.id === edge.taskId)
  if (!target || (target.after ?? []).includes(edge.after) || wouldCreateCycle(tasks, edge.taskId, edge.after)) return tasks
  return tasks.map((t) => (t.id === edge.taskId ? touch(t, { after: [...(t.after ?? []), edge.after] }) : t))
}
const tomb = (id: string, kind: Tombstone['kind']): Tombstone => ({ id, kind, at: Date.now() })

function withoutId(list: string[], id: string): string[] | undefined {
  const rest = list.filter((x) => x !== id)
  return rest.length ? rest : undefined
}

/** Assigned once the store exists; referencing the store inside its own config would break inference. */
let canPersist = (): boolean => false

/** Starting route from the URL hash, so a reload on #area/x doesn't push a bogus entry. */
function initialRoute(): Route {
  return typeof location === 'undefined' ? parseHash('') : parseHash(location.hash)
}

export const currentHash = (s: Pick<StoreState, 'view' | 'tasksMode' | 'areaFilter'>): string =>
  routeToHash({ view: s.view, mode: s.tasksMode, area: s.areaFilter })

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
        view: initialRoute().view,
        tasksMode: initialRoute().mode,
        areaFilter: initialRoute().area,
        quickAddOpen: false,
        assistBusy: [],
        selectedId: null,
        toast: null,
        undoSnapshot: null,
        lastCompleted: null,
        importOpen: false,
        settingsOpen: false,
        newAreaOpen: false,
        accountOpen: false,
        quickFindOpen: false,
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
          // A repeating task makes one next copy; re-checking it never makes a second.
          const hasCopy = get().tasks.some((t) => t.repeatOf === id && !t.done)
          const next = done && !hasCopy ? nextOccurrence(task, now, newId) : null
          // Un-checking withdraws the copy it spawned, as long as nobody has touched that copy.
          const spawned = done ? undefined : get().tasks.find((t) => t.repeatOf === id && !t.done && t.updatedAt === t.createdAt)
          const message = !done
            ? 'Marked as not done'
            : next?.due
              ? `Done. Next one is due ${formatDue(next.due, now)}`
              : `Done: ${task.title}`
          withUndo(message, () => {
            mapTask(id, (t) => touch(t, { done, doneAt: done ? Date.now() : null }))
            if (next) set((s) => ({ tasks: [...s.tasks, next] }))
            if (spawned) {
              set((s) => ({
                tasks: s.tasks.filter((t) => t.id !== spawned.id),
                tombstones: [...s.tombstones, tomb(spawned.id, 'task')],
              }))
            }
          })
          if (done) set({ lastCompleted: { id, areaId: task.areaId, at: Date.now() } })
        },

        deleteTask: (id) => {
          const task = get().tasks.find((t) => t.id === id)
          if (!task) return
          withUndo(`Deleted "${task.title}"`, () =>
            set((s) => ({
              // Tasks that waited for this one stop waiting.
              tasks: s.tasks
                .filter((t) => t.id !== id)
                .map((t) => (t.after?.includes(id) ? touch(t, { after: withoutId(t.after, id) }) : t)),
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
              areaFilter: s.areaFilter === id ? moveTasksTo : s.areaFilter,
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

        wipeLocal: () =>
          set((s) => ({
            areas: DEFAULT_AREAS.map((a) => ({ ...a })),
            tasks: [],
            tombstones: [],
            selectedId: null,
            focusTaskId: null,
            undoSnapshot: null,
            toast: null,
            lastCompleted: null,
            prefs: { ...s.prefs, hiddenAreas: [] },
          })),

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
          // Undoing must also count as a new edit for sync, so re-stamp what it brings back,
          // and leave tombstones for anything it removes (e.g. an import or a repeat's next copy)
          // so another device or the cloud copy can't bring those back.
          const now = Date.now()
          const current = new Map(get().tasks.map((t) => [t.id, t]))
          const keptTasks = new Set(snap.tasks.map((t) => t.id))
          const keptAreas = new Set(snap.areas.map((a) => a.id))
          const removed: Tombstone[] = [
            ...get().tasks.filter((t) => !keptTasks.has(t.id)).map((t) => ({ id: t.id, kind: 'task' as const, at: now })),
            ...get().areas.filter((a) => !keptAreas.has(a.id)).map((a) => ({ id: a.id, kind: 'area' as const, at: now })),
          ]
          set((s) => ({
            areas: snap.areas.map((a) => ({ ...a, updatedAt: now })),
            tasks: snap.tasks.map((t) => (current.get(t.id) === t ? t : { ...t, updatedAt: now })),
            tombstones: [...snap.tombstones, ...removed],
            prefs: { ...s.prefs, hiddenAreas: snap.hiddenAreas },
            undoSnapshot: null,
            toast: null,
            lastCompleted: null,
          }))
        },

        showToast: (message, undoable = false, sticky = false) =>
          set({ toast: { id: newId(), message, undoable, sticky } }),
        dismissToast: () => set({ toast: null, undoSnapshot: null }),
        setView: (view) => get().navigate({ view, area: view === 'tasks' ? get().areaFilter : null }),
        // Focus and Reset show one task at a time; an open detail panel there would just duplicate it.
        navigate: (to) =>
          set((s) => {
            const view = to.view ?? s.view
            return {
              view,
              tasksMode: to.mode ?? s.tasksMode,
              areaFilter: to.area !== undefined ? to.area : view === 'tasks' ? s.areaFilter : null,
              selectedId: view === 'focus' || view === 'reset' ? null : s.selectedId,
              toast: s.toast?.undoable || s.toast?.sticky ? s.toast : null,
            }
          }),
        setQuickAddOpen: (open) => set({ quickAddOpen: open }),
        setAssistBusy: (taskId, busy) =>
          set((s) => ({ assistBusy: busy ? [...s.assistBusy, taskId] : s.assistBusy.filter((id) => id !== taskId) })),

        applyAssist: ({ taskId, patch, steps, blocks, extras, message }) => {
          const now = new Date()
          withUndo(message, () =>
            set((s) => {
              const ids = new Set(s.tasks.map((t) => t.id))
              const fallbackArea = patch.areaId ?? s.tasks.find((t) => t.id === taskId)?.areaId ?? s.areas[0]?.id ?? ''
              const extraTasks = extras.map((d) => {
                const areaId = s.areas.find((a) => a.name.toLowerCase() === (d.area ?? '').toLowerCase())?.id ?? fallbackArea
                return draftToTask(d, areaId, now, 'week')
              })
              const patched = s.tasks.map((t) =>
                t.id === taskId
                  ? touch(t, {
                      ...patch,
                      after: t.after,
                      steps: [...t.steps, ...steps.map((title) => ({ id: newId(), title, done: false }))],
                    })
                  : t,
              )
              // Model output is untrusted: add each link only if it points at a real task and keeps the graph acyclic.
              const edges = [
                ...(patch.after ?? []).map((after) => ({ taskId, after })),
                ...blocks.slice(0, MAX_ASSIST_BLOCKS).map((blocked) => ({ taskId: blocked, after: taskId })),
              ].filter((e) => ids.has(e.taskId) && ids.has(e.after))
              const tasks = edges.reduce(linkIfAcyclic, patched)
              return { tasks: [...tasks, ...extraTasks] }
            }),
          )
        },

        addDependencies: (edges) => {
          const { tasks } = get()
          const ids = new Set(tasks.map((t) => t.id))
          const requested = edges.flatMap((e) => e.after.map((after) => ({ taskId: e.taskId, after })))
          // Work out what will really change first, so a no-op never replaces a pending Undo.
          const linked = requested.filter((e) => ids.has(e.after)).reduce(linkIfAcyclic, tasks)
          const added = linked.reduce((n, t, i) => n + ((t.after?.length ?? 0) - (tasks[i]?.after?.length ?? 0)), 0)
          if (added === 0) return
          withUndo(`Linked ${added} ${added === 1 ? 'task' : 'tasks'} in order`, () => set({ tasks: linked }))
        },
        select: (id) => set({ selectedId: id }),
        setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
        setImportOpen: (open) => set({ importOpen: open }),
        setSettingsOpen: (open) => set({ settingsOpen: open }),
        setNewAreaOpen: (open) => set({ newAreaOpen: open }),
        setAccountOpen: (open) => set({ accountOpen: open }),
        setQuickFindOpen: (open) => set({ quickFindOpen: open }),
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
