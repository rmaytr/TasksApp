import { useMemo, useState, type FormEvent } from 'react'
import { parseCapture } from '../lib/capture'
import { resolveArea } from '../lib/classify'
import { useAreaMap, useNow, areaStyle } from '../hooks'
import { HORIZON_LABEL } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import './CaptureBar.css'

const PLACEHOLDER = 'Add a task — try “Email mentee #orgs tomorrow !”'

export function CaptureBar() {
  const [text, setText] = useState('')
  const [areaOverride, setAreaOverride] = useState<string | null>(null)
  const areas = useStore((s) => s.areas)
  const addTask = useStore((s) => s.addTask)
  const showToast = useStore((s) => s.showToast)
  const areaMap = useAreaMap()
  const now = useNow()

  const parsed = useMemo(() => {
    if (!text.trim()) return null
    const { draft, chips } = parseCapture(text, areas, now)
    const resolved = resolveArea(draft.area, draft.title, areas)
    return { draft, chips: chips.filter((c) => c.kind !== 'area'), ...resolved }
  }, [text, areas, now])

  const override = areaOverride && areaMap.has(areaOverride) ? areaOverride : null
  const areaId = override ?? parsed?.areaId ?? null
  const area = areaId ? areaMap.get(areaId) : undefined

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!parsed || !areaId || !parsed.draft.title.trim()) return
    addTask(parsed.draft, areaId, 'week')
    const ring = parsed.draft.horizon ? HORIZON_LABEL[parsed.draft.horizon] : null
    showToast(`Added to ${area?.name ?? 'your radar'}${ring ? ` · ${ring}` : ''}`)
    setText('')
    setAreaOverride(null)
  }

  return (
    <form className="capture" onSubmit={submit} aria-label="Add a task">
      <span className="capture__icon">
        <Icon name="plus" />
      </span>
      <input
        id="capture-input"
        className="capture__input"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (!e.target.value) setAreaOverride(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur()
        }}
        placeholder={PLACEHOLDER}
        aria-label="New task"
        aria-describedby="capture-hint"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={300}
      />
      {parsed && (
        <div className="capture__chips" id="capture-hint">
          <label
            className={`chip chip--area${parsed.guessed && !override ? ' chip--guess' : ''}`}
            style={areaStyle(area)}
            title={parsed.guessed && !override ? 'Guessed from the words — click to change' : 'Area'}
          >
            <span className="dot" />
            <select
              value={areaId ?? ''}
              onChange={(e) => setAreaOverride(e.target.value)}
              aria-label={parsed.guessed && !override ? 'Area for this task (guessed)' : 'Area for this task'}
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {parsed.chips.map((chip) => (
            <span key={`${chip.kind}-${chip.label}`} className={`chip chip--${chip.kind}`}>
              {chip.label}
            </span>
          ))}
          <button type="submit" className="capture__add" aria-label="Enter, add task">
            <span className="kbd">Enter</span>
          </button>
        </div>
      )}
      {!parsed && (
        <span className="capture__hint" id="capture-hint">
          <span className="kbd">/</span>
        </span>
      )}
    </form>
  )
}
