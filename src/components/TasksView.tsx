import { useEffect, useState } from 'react'
import { areaStyle, useAreaMap } from '../hooks'
import { MapView } from '../map/MapView'
import { RadarView } from '../radar/RadarView'
import type { TasksMode } from '../route'
import { useStore } from '../store/useStore'
import { Icon, type IconName } from './Icon'
import { ListView, type ListFilters } from './ListView'
import './TasksView.css'

const MODES: readonly { mode: TasksMode; label: string; icon: IconName }[] = [
  { mode: 'list', label: 'List', icon: 'list' },
  { mode: 'map', label: 'Map', icon: 'map' },
  { mode: 'radar', label: 'Radar', icon: 'radar' },
]

const PRIORITIES: readonly { value: ListFilters['priority']; label: string }[] = [
  { value: 'all', label: 'Any priority' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]

/** All tasks, or one area's tasks, as a list, a map or a radar. */
export function TasksView() {
  const mode = useStore((s) => s.tasksMode)
  const areaId = useStore((s) => s.areaFilter)
  const navigate = useStore((s) => s.navigate)
  const setQuickAddOpen = useStore((s) => s.setQuickAddOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const area = useAreaMap().get(areaId ?? '')
  const [filters, setFilters] = useState<ListFilters>({ priority: 'all', waiting: false, showDone: false, query: '' })
  const title = area?.name ?? 'All tasks'
  const missingArea = areaId !== null && !area

  // An old bookmark, or an area deleted here or on another device: fall back to All tasks.
  useEffect(() => {
    if (missingArea) navigate({ area: null })
  }, [missingArea, navigate])

  return (
    <div className={`tasks tasks--${mode}`} style={areaStyle(area)}>
      <header className="tasks__head">
        <div className="tasks__title-row">
          {area && <span className="tasks__swatch" aria-hidden="true" />}
          <h1 className="tasks__title">{title}</h1>
          {area && (
            <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label={`Edit the ${area.name} area`}>
              <Icon name="dots" size={20} />
            </button>
          )}
          <div className="tasks__spacer" />
          <div className="seg tasks__modes" role="group" aria-label="Show as">
            {MODES.map((m) => (
              <button key={m.mode} type="button" aria-pressed={mode === m.mode} onClick={() => navigate({ mode: m.mode })}>
                <Icon name={m.icon} size={16} /> {m.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--primary tasks__add" onClick={() => setQuickAddOpen(true)}>
            <Icon name="plus" size={18} /> New task
          </button>
        </div>
        {mode === 'list' && (
          <div className="tasks__filters">
            <label className="tasks__search">
              <Icon name="search" size={17} />
              <input
                type="search"
                value={filters.query}
                onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                placeholder={area ? `Search ${area.name}` : 'Search tasks'}
                aria-label="Search tasks"
              />
            </label>
            <div className="tasks__chips" role="group" aria-label="Priority">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className="chip"
                  aria-pressed={filters.priority === p.value}
                  onClick={() => setFilters({ ...filters, priority: p.value })}
                >
                  {p.value !== 'all' && <span className="prio" data-level={p.value}><i /><i /><i /></span>}
                  {p.label}
                </button>
              ))}
            </div>
            <div className="tasks__chips">
              <button type="button" className="chip" aria-pressed={filters.waiting} onClick={() => setFilters({ ...filters, waiting: !filters.waiting })}>
                Waiting on someone
              </button>
              <button type="button" className="chip" aria-pressed={filters.showDone} onClick={() => setFilters({ ...filters, showDone: !filters.showDone })}>
                Show done
              </button>
            </div>
          </div>
        )}
      </header>
      <div className="tasks__body">
        {mode === 'list' && <ListView areaId={area?.id ?? null} filters={filters} />}
        {mode === 'map' && <MapView areaId={area?.id ?? null} />}
        {mode === 'radar' && <RadarView areaId={area?.id ?? null} />}
      </div>
    </div>
  )
}
