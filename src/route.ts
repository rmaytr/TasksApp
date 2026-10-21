/**
 * App navigation lives in the URL hash so refresh and back work, and GitHub Pages needs
 * no server routing:
 *   #home · #tasks · #tasks/map · #tasks/radar · #area/<id>[/map|/radar] · #focus · #reset
 */
export type View = 'home' | 'tasks' | 'focus' | 'reset'
export type TasksMode = 'list' | 'map' | 'radar'

export interface Route {
  view: View
  mode: TasksMode
  /** When set, Tasks shows only this area. */
  area: string | null
}

export const HOME: Route = { view: 'home', mode: 'list', area: null }

const MODES: readonly TasksMode[] = ['list', 'map', 'radar']

const asMode = (value: string | undefined): TasksMode =>
  MODES.includes(value as TasksMode) ? (value as TasksMode) : 'list'

/** A hand-edited or truncated link (e.g. `#area/%E0%A4`) must not crash the app. */
function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function parseHash(hash: string): Route {
  const [head = '', second, third] = hash.replace(/^#\/?/, '').split('/')
  if (head === 'focus' || head === 'reset') return { ...HOME, view: head }
  if (head === 'tasks') return { view: 'tasks', mode: asMode(second), area: null }
  if (head === 'area' && second) {
    const area = safeDecode(second)
    return area ? { view: 'tasks', mode: asMode(third), area } : HOME
  }
  // Old v1 links (#radar, #list, #map) still land somewhere sensible.
  if (head === 'radar' || head === 'map' || head === 'list') return { view: 'tasks', mode: head, area: null }
  return HOME
}

export function routeToHash(route: Route): string {
  if (route.view !== 'tasks') return `#${route.view}`
  const mode = route.mode === 'list' ? '' : `/${route.mode}`
  return route.area ? `#area/${encodeURIComponent(route.area)}${mode}` : `#tasks${mode}`
}
