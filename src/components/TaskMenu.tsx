import { useState, type Ref } from 'react'
import { useNow } from '../hooks'
import { addDays, fromISODate, parseDateToken, todayISO } from '../lib/dates'
import { priorityOf, type Task } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Menu, MenuDivider, MenuItem, MenuLabel, type MenuAnchor } from './Menu'

interface TaskMenuProps {
  task: Task
  anchor: MenuAnchor | null
  onClose: () => void
}

const short = (iso: string): string => fromISODate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/** Quick actions on a task without opening it: when, priority, Lock in, area, delete. */
export function TaskMenu({ task, anchor, onClose }: TaskMenuProps) {
  const areas = useStore((s) => s.areas)
  const updateTask = useStore((s) => s.updateTask)
  const moveTask = useStore((s) => s.moveTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const startFocus = useStore((s) => s.startFocus)
  const [moving, setMoving] = useState(false)

  const now = useNow()
  const today = todayISO(now)
  const dates = [
    { label: 'Today', due: today },
    { label: 'Tomorrow', due: addDays(today, 1) },
    { label: 'This weekend', due: parseDateToken('this weekend', now)?.due },
    { label: 'Next week', due: parseDateToken('next week', now)?.due },
  ].filter((d): d is { label: string; due: string } => Boolean(d.due))

  const close = (): void => {
    setMoving(false)
    onClose()
  }
  const run = (action: () => void) => (): void => {
    action()
    close()
  }
  const high = priorityOf(task) === 'high'

  return (
    <Menu anchor={anchor} onClose={close} label={`Actions for ${task.title}`}>
      {moving ? (
        <>
          <MenuItem icon="chevronLeft" onSelect={() => setMoving(false)}>
            Back
          </MenuItem>
          <MenuLabel>Move to</MenuLabel>
          {areas.map((a) => (
            <MenuItem
              key={a.id}
              checked={a.id === task.areaId}
              onSelect={run(() => a.id !== task.areaId && moveTask(task.id, { areaId: a.id }, `Moved to ${a.name}`))}
            >
              <span className="menu__area">
                <span className="dot" style={{ background: `var(--area-${a.color})` }} /> {a.name}
              </span>
            </MenuItem>
          ))}
        </>
      ) : (
        <>
          <MenuLabel>Due</MenuLabel>
          {dates.map((d) => (
            <MenuItem key={d.label} icon={d.due === task.due ? 'check' : 'calendar'} hint={short(d.due)} onSelect={run(() => updateTask(task.id, { due: d.due }))}>
              {d.label}
            </MenuItem>
          ))}
          {task.due && (
            <MenuItem icon="close" onSelect={run(() => updateTask(task.id, { due: null }))}>
              No date
            </MenuItem>
          )}
          <MenuDivider />
          <MenuItem icon="flag" onSelect={run(() => updateTask(task.id, { high: !high, low: false }))}>
            {high ? 'Remove high priority' : 'Mark high priority'}
          </MenuItem>
          {!task.done && (
            <MenuItem icon="target" onSelect={run(() => startFocus(task.id))}>
              Lock in on this
            </MenuItem>
          )}
          <MenuItem icon="move" onSelect={() => setMoving(true)}>
            Move to area…
          </MenuItem>
          <MenuDivider />
          <MenuItem icon="trash" danger onSelect={run(() => deleteTask(task.id))}>
            Delete
          </MenuItem>
        </>
      )}
    </Menu>
  )
}

/** The ⋯ trigger, shared by list rows. */
export function TaskMenuButton({ title, open, onToggle, buttonRef }: { title: string; open: boolean; onToggle: () => void; buttonRef: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="trow__dots"
      aria-label={`Actions for ${title}`}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={onToggle}
    >
      <Icon name="dots" size={18} />
    </button>
  )
}
