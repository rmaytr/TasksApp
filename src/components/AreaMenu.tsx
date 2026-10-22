import { useState, type CSSProperties } from 'react'
import { AREA_COLORS, type Area } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Menu, MenuDivider, MenuItem, MenuLabel, type MenuAnchor } from './Menu'

interface AreaMenuProps {
  area: Area
  anchor: MenuAnchor | null
  onClose: () => void
  /** Turns the area's row into a name field. */
  onRename: () => void
}

const colorName = (c: string): string => c[0]?.toUpperCase() + c.slice(1)

/** Everything you can do with an area, right where the area is. */
export function AreaMenu({ area, anchor, onClose, onRename }: AreaMenuProps) {
  const areas = useStore((s) => s.areas)
  const openCount = useStore((s) => s.tasks.filter((t) => t.areaId === area.id && !t.done).length)
  const updateArea = useStore((s) => s.updateArea)
  const moveArea = useStore((s) => s.moveArea)
  const deleteArea = useStore((s) => s.deleteArea)
  const setQuickAddOpen = useStore((s) => s.setQuickAddOpen)
  const [confirming, setConfirming] = useState(false)
  const others = areas.filter((a) => a.id !== area.id)
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '')
  const target = others.some((a) => a.id === moveTo) ? moveTo : (others[0]?.id ?? '')
  const index = areas.findIndex((a) => a.id === area.id)

  const close = (): void => {
    setConfirming(false)
    onClose()
  }
  const run = (action: () => void) => (): void => {
    action()
    close()
  }

  return (
    <Menu anchor={anchor} onClose={close} label={`${area.name} options`}>
      {confirming ? (
        <form
          className="menu__form"
          onSubmit={(e) => {
            e.preventDefault()
            deleteArea(area.id, target)
            close()
          }}
        >
          <p>
            <strong>Delete {area.name}?</strong>{' '}
            {openCount > 0 ? `Its ${openCount} open ${openCount === 1 ? 'task moves' : 'tasks move'} to:` : 'It has no open tasks.'}
          </p>
          {openCount > 0 && (
            <select className="field" value={target} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move its tasks to" data-menu-focus>
              {others.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <div className="menu__row">
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirming(false)} data-menu-focus={openCount === 0 || undefined}>
              Cancel
            </button>
            <button type="submit" className="btn btn--sm btn--danger">
              <Icon name="trash" size={15} /> Delete
            </button>
          </div>
        </form>
      ) : (
        <>
          <MenuItem icon="plus" onSelect={run(() => setQuickAddOpen(true, area.id))}>
            Add a task here
          </MenuItem>
          <MenuItem icon="pencil" onSelect={run(onRename)}>
            Rename
          </MenuItem>
          <MenuLabel>Colour</MenuLabel>
          <div className="menu__swatches" role="group" aria-label="Colour">
            {AREA_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="menuitemradio"
                aria-checked={area.color === c}
                aria-label={colorName(c)}
                title={colorName(c)}
                className="menu__swatch"
                style={{ '--sw': `var(--area-${c})` } as CSSProperties}
                onClick={() => updateArea(area.id, { color: c })}
              >
                {area.color === c && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
          <MenuDivider />
          {index > 0 && (
            <MenuItem icon="arrowUp" onSelect={() => moveArea(area.id, -1)}>
              Move up
            </MenuItem>
          )}
          {index < areas.length - 1 && (
            <MenuItem icon="arrowDown" onSelect={() => moveArea(area.id, 1)}>
              Move down
            </MenuItem>
          )}
          {others.length > 0 && (
            <>
              <MenuDivider />
              <MenuItem icon="trash" danger onSelect={() => setConfirming(true)}>
                Delete area…
              </MenuItem>
            </>
          )}
        </>
      )}
    </Menu>
  )
}
