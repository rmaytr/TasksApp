import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAddTask } from '../assist/useAddTask'
import { Icon } from './Icon'

interface AddRowProps {
  label: string
  areaId?: string | null
}

/** "+ Add a task" that is a real button until clicked, then a focused input. */
export function AddRow({ label, areaId = null }: AddRowProps) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const add = useAddTask()
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Only Escape hands focus back to the button; a blur means the user is going somewhere else.
  const refocus = useRef(false)

  useEffect(() => {
    if (editing || !refocus.current) return
    refocus.current = false
    buttonRef.current?.focus()
  }, [editing])

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (add(text, areaId)) setText('')
  }

  if (!editing) {
    return (
      <button ref={buttonRef} type="button" className="add-row" onClick={() => setEditing(true)}>
        <Icon name="plus" size={18} /> {label}
      </button>
    )
  }
  return (
    <form className="add-row add-row--editing" onSubmit={submit}>
      <Icon name="plus" size={18} />
      <input
        autoFocus
        className="add-row__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => !text.trim() && setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Close only this row, not the task panel or dialog around it.
            e.stopPropagation()
            refocus.current = true
            setText('')
            setEditing(false)
          }
        }}
        placeholder="Type a task and press Enter"
        aria-label={label}
        maxLength={300}
      />
    </form>
  )
}
