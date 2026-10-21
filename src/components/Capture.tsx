import { useId, useMemo, useState, type FormEvent } from 'react'
import { previewCapture, useAddTask } from '../assist/useAddTask'
import { areaStyle, useAreaMap, useMediaQuery, useNow } from '../hooks'
import { formatDue } from '../lib/dates'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import './Capture.css'

interface CaptureProps {
  /** `hero` is the big box on Today; `sheet` sits in the New task dialog. */
  variant: 'hero' | 'sheet'
  /** Pre-select an area (e.g. when adding from an area page). */
  areaId?: string | null
  onAdded?: (id: string) => void
  autoFocus?: boolean
}

const HINT = 'Try “Finish lab report by Friday”'

/**
 * A single text box. Enter saves immediately; area, date and priority are inferred and shown
 * as a quiet preview line that can be corrected, but never has to be.
 */
export function Capture({ variant, areaId = null, onAdded, autoFocus = false }: CaptureProps) {
  const [text, setText] = useState('')
  const [override, setOverride] = useState<string | null>(null)
  const areas = useStore((s) => s.areas)
  const ai = useStore((s) => s.prefs.ai)
  const showToast = useStore((s) => s.showToast)
  const areaMap = useAreaMap()
  const phone = useMediaQuery('(max-width: 760px)')
  const add = useAddTask()
  const now = useNow()
  const forced = override ?? areaId
  const previewId = useId()

  // Recomputes on every keystroke; parsing one line is cheap.
  const preview = useMemo(() => previewCapture(text, forced, areas), [text, forced, areas])
  const area = preview ? areaMap.get(preview.areaId) : undefined

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const id = add(text, forced)
    if (!id) return
    showToast(ai === 'off' ? `Added to ${area?.name ?? 'your tasks'}` : `Added. Cairn is sorting the details…`)
    setText('')
    setOverride(null)
    onAdded?.(id)
  }

  return (
    <form className={`capture capture--${variant}`} onSubmit={submit} aria-label="Add a task">
      <div className="capture__box">
        <span className="capture__icon" aria-hidden="true">
          <Icon name={ai === 'off' ? 'plus' : 'sparkle'} size={variant === 'hero' ? 22 : 20} />
        </span>
        <input
          id={variant === 'hero' ? 'capture-input' : undefined}
          className="capture__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={variant === 'hero' ? 'What’s on your mind?' : 'What do you need to do?'}
          aria-label="New task"
          aria-describedby={previewId}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={300}
          autoFocus={autoFocus}
          data-autofocus={autoFocus || undefined}
        />
        <button type="submit" className="btn btn--primary capture__submit" disabled={!text.trim()}>
          {phone ? <Icon name="arrowRight" size={18} /> : 'Add'}
          {phone && <span className="visually-hidden">Add task</span>}
        </button>
      </div>
      <div className="capture__preview" id={previewId} aria-live="polite">
        {preview ? (
          <>
            <label className="capture__area" style={areaStyle(area)}>
              <span className="dot" />
              <select
                value={preview.areaId}
                onChange={(e) => setOverride(e.target.value)}
                aria-label={preview.guessed ? 'Area (guessed from your words)' : 'Area'}
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Icon name="chevron" size={12} />
            </label>
            {preview.due && <span className="tag tag--soon num">{formatDue(preview.due, now)}</span>}
            {preview.high && <span className="tag tag--high">High priority</span>}
            {ai !== 'off' && (
              <span className="capture__ai">
                <Icon name="sparkle" size={14} /> Steps, dates and order filled in for you
              </span>
            )}
          </>
        ) : (
          variant === 'hero' && <span className="capture__hint">{HINT}. Press Enter, that’s it.</span>
        )}
      </div>
    </form>
  )
}
