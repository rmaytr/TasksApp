import { useEffect, useRef, useState } from 'react'
import { areaStyle, useAreaMap } from '../hooks'
import { MapView } from '../map/MapView'
import { RadarView } from '../radar/RadarView'
import type { TasksMode } from '../route'
import { useStore } from '../store/useStore'
import { AreaMenu } from './AreaMenu'
import { Icon, type IconName } from './Icon'
import { ListView, type ListFilters, type ListSort } from './ListView'
import { useMenu } from './useMenu'
import './TasksView.css'

const MODES: readonly { mode: TasksMode; label: string; icon: IconName }[] = [
  { mode: 'list', label: 'List', icon: 'list' },
  { mode: 'map', label: 'Map', icon: 'map' },
  { mode: 'radar', label: 'Radar', icon: 'radar' },
]

const SORTS: readonly { value: ListSort; label: string }[] = [
  { value: 'smart', label: 'Smart order' },
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
]

/** All tasks, or one area's tasks, as a list, a map or a radar. */
export function TasksView() {
  const mode = useStore((s) => s.tasksMode)
  const areaId = useStore((s) => s.areaFilter)
  const navigate = useStore((s) => s.navigate)
  const setQuickAddOpen = useStore((s) => s.setQuickAddOpen)
  const updateArea = useStore((s) => s.updateArea)
  const menu = useMenu()
  const dotsRef = useRef<HTMLButtonElement>(null)
  const [renaming, setRenaming] = useState(false)
  const area = useAreaMap().get(areaId ?? '')
  const [filters, setFilters] = useState<ListFilters>({ sort: 'smart', reverse: false, showDone: false, query: '' })
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
          {area && renaming ? (
            <input
              className="tasks__title tasks__rename"
              defaultValue={area.name}
              autoFocus
              maxLength={40}
              aria-label={`Rename ${area.name}`}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                const name = e.currentTarget.value.trim()
                if (name && name !== area.name) updateArea(area.id, { name })
                setRenaming(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  e.currentTarget.value = area.name
                  e.currentTarget.blur()
                }
              }}
            />
          ) : (
            <h1 className="tasks__title">{title}</h1>
          )}
          {area && (
            <>
              <button
                ref={dotsRef}
                type="button"
                className="icon-btn"
                onClick={() => (menu.anchor ? menu.close() : menu.openAt({ el: dotsRef.current }))}
                aria-label={`Options for ${area.name}`}
                aria-haspopup="menu"
                aria-expanded={Boolean(menu.anchor)}
              >
                <Icon name="dots" size={20} />
              </button>
              <AreaMenu area={area} anchor={menu.anchor} onClose={menu.close} onRename={() => setRenaming(true)} />
            </>
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
            <label className="tasks__sort">
              <Icon name="sort" size={16} />
              <span className="visually-hidden">Sort by</span>
              <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value as ListSort })}>
                {SORTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="icon-btn tasks__toggle"
              aria-pressed={filters.reverse}
              onClick={() => setFilters({ ...filters, reverse: !filters.reverse })}
              aria-label="Reverse order"
              title="Reverse order"
            >
              <Icon name="arrowDown" size={18} />
            </button>
            <button
              type="button"
              className="icon-btn tasks__toggle"
              aria-pressed={filters.showDone}
              onClick={() => setFilters({ ...filters, showDone: !filters.showDone })}
              aria-label="Show done tasks"
              title="Show done tasks"
            >
              <Icon name="doneAll" size={18} />
            </button>
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
