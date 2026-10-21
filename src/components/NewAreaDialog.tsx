import { useState, type FormEvent } from 'react'
import { MAX_AREAS } from '../model/defaults'
import { AREA_COLORS, type AreaColor } from '../model/types'
import { useStore } from '../store/useStore'
import { Dialog } from './Dialog'
import './NewAreaDialog.css'

const SUGGESTIONS = ['Gym', 'Research', 'Job', 'Family', 'Money', 'Side hustle', 'Health', 'Travel']

export function NewAreaDialog() {
  const open = useStore((s) => s.newAreaOpen)
  const setOpen = useStore((s) => s.setNewAreaOpen)
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="New area">
      {open && <NewAreaForm onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

function NewAreaForm({ onDone }: { onDone: () => void }) {
  const areas = useStore((s) => s.areas)
  const addArea = useStore((s) => s.addArea)
  const showToast = useStore((s) => s.showToast)
  const used = new Set(areas.map((a) => a.color))
  const [name, setName] = useState('')
  const [color, setColor] = useState<AreaColor>(AREA_COLORS.find((c) => !used.has(c)) ?? 'indigo')
  const full = areas.length >= MAX_AREAS
  const taken = areas.some((a) => a.name.toLowerCase() === name.trim().toLowerCase())
  const unusedSuggestions = SUGGESTIONS.filter((s) => !areas.some((a) => a.name.toLowerCase() === s.toLowerCase()))

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!name.trim() || full || taken) return
    if (addArea(name, color)) {
      showToast(`Added the ${name.trim()} area`)
      onDone()
    }
  }

  if (full) {
    return (
      <div className="dialog__body">
        <p>
          You have {MAX_AREAS} areas, the most the radar can show clearly. Remove or merge one in Settings to add
          another.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <div className="dialog__body new-area">
        <p className="new-area__intro">
          Areas are the slices of your radar, one for each part of your life. Each gets its own color.
        </p>
        <label className="new-area__field">
          <span>Name</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Research"
            maxLength={40}
            autoFocus
            data-autofocus
            aria-invalid={taken}
            aria-describedby={taken ? 'area-taken' : undefined}
          />
        </label>
        {taken && (
          <p id="area-taken" className="new-area__error">
            You already have an area with that name.
          </p>
        )}
        {unusedSuggestions.length > 0 && !name && (
          <div className="new-area__suggest" aria-label="Suggestions">
            {unusedSuggestions.slice(0, 6).map((s) => (
              <button key={s} type="button" className="btn btn--ghost" onClick={() => setName(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <fieldset className="new-area__colors">
          <legend>Color</legend>
          <div className="new-area__swatches">
            {AREA_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="new-area__swatch"
                style={{ background: `var(--area-${c})` }}
                aria-pressed={color === c}
                aria-label={`${c}${used.has(c) ? ' (already used)' : ''}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </fieldset>
        <p className="new-area__preview" style={{ color: `var(--area-${color}-text)` }}>
          <span className="dot" style={{ background: `var(--area-${color})` }} />
          {name.trim() || 'Your new area'}
        </p>
      </div>
      <footer className="dialog__foot">
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={!name.trim() || taken}>
          Create area
        </button>
      </footer>
    </form>
  )
}
