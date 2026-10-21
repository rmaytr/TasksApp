import { useState } from 'react'
import { useAreaMap } from '../hooks'
import { useStore } from '../store/useStore'
import { Capture } from './Capture'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import './QuickAddDialog.css'

/** The global "New task" sheet. Stays open so a brain dump can be typed line after line. */
export function QuickAddDialog() {
  const open = useStore((s) => s.quickAddOpen)
  const setOpen = useStore((s) => s.setQuickAddOpen)
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="New task">
      {open && <QuickAddBody onClose={() => setOpen(false)} />}
    </Dialog>
  )
}

function QuickAddBody({ onClose }: { onClose: () => void }) {
  const areaFilter = useStore((s) => s.areaFilter)
  const view = useStore((s) => s.view)
  const tasks = useStore((s) => s.tasks)
  const areaMap = useAreaMap()
  const [added, setAdded] = useState<string[]>([])
  const addedTasks = added.map((id) => tasks.find((t) => t.id === id)).filter((t) => t !== undefined)

  return (
    <div className="dialog__body quick">
      <Capture variant="sheet" areaId={view === 'tasks' ? areaFilter : null} autoFocus onAdded={(id) => setAdded((a) => [id, ...a])} />
      {addedTasks.length > 0 && (
        <ul className="quick__added" aria-label="Added just now">
          {addedTasks.map((t) => (
            <li key={t.id}>
              <Icon name="check" size={15} /> {t.title}
              <span className="quick__area">{areaMap.get(t.areaId)?.name}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="quick__foot">
        <span className="quick__hint">Keep typing to add more. Esc closes.</span>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
