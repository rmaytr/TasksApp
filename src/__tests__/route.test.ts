import { describe, expect, it } from 'vitest'
import { HOME, parseHash, routeToHash, type Route } from '../route'

describe('route', () => {
  it('round-trips every route shape', () => {
    const routes: Route[] = [
      HOME,
      { view: 'focus', mode: 'list', area: null },
      { view: 'reset', mode: 'list', area: null },
      { view: 'tasks', mode: 'list', area: null },
      { view: 'tasks', mode: 'map', area: null },
      { view: 'tasks', mode: 'radar', area: 'classes' },
      { view: 'tasks', mode: 'list', area: 'a b/c' },
    ]
    for (const r of routes) expect(parseHash(routeToHash(r))).toEqual(r)
  })

  it('falls back to Home for unknown hashes and keeps old v1 links working', () => {
    expect(parseHash('')).toEqual(HOME)
    expect(parseHash('#nope')).toEqual(HOME)
    expect(parseHash('#radar')).toEqual({ view: 'tasks', mode: 'radar', area: null })
    expect(parseHash('#tasks/bogus')).toEqual({ view: 'tasks', mode: 'list', area: null })
  })

  it('survives a malformed area link instead of crashing the app', () => {
    expect(parseHash('#area/%E0%A4%A')).toEqual(HOME)
  })
})
