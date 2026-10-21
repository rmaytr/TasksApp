import { useRef, useState } from 'react'
import { areaStyle, useAreaMap } from '../hooks'
import type { Task } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import './StepList.css'

interface StepListProps {
  task: Task
  compact?: boolean
}

/** Checklist of a task's steps with inline editing and an always-ready "add step" field. */
export function StepList({ task, compact = false }: StepListProps) {
  const addStep = useStore((s) => s.addStep)
  const updateStep = useStore((s) => s.updateStep)
  const deleteStep = useStore((s) => s.deleteStep)
  const area = useAreaMap().get(task.areaId)
  const [draft, setDraft] = useState('')
  const addRef = useRef<HTMLInputElement>(null)

  return (
    <div className={`steps${compact ? ' steps--compact' : ''}`} style={areaStyle(area)}>
      {task.steps.length > 0 && (
        <ul className="steps__list">
          {task.steps.map((step) => (
            // Keyed on the title too, so the uncontrolled input picks up external changes like Undo.
            <li key={`${step.id}:${step.title}`} className={`steps__item${step.done ? ' is-done' : ''}`}>
              <input
                type="checkbox"
                className="check check--square"
                checked={step.done}
                onChange={(e) => updateStep(task.id, step.id, { done: e.target.checked })}
                aria-label={`Step done: ${step.title}`}
              />
              <input
                className="steps__text"
                defaultValue={step.title}
                aria-label="Step"
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (!v) deleteStep(task.id, step.id)
                  else if (v !== step.title) updateStep(task.id, step.id, { title: v.slice(0, 300) })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addRef.current?.focus()
                  }
                }}
              />
              <button type="button" className="icon-btn steps__del" onClick={() => deleteStep(task.id, step.id)} aria-label={`Remove step ${step.title}`}>
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="steps__add"
        onSubmit={(e) => {
          e.preventDefault()
          addStep(task.id, draft)
          setDraft('')
        }}
      >
        <Icon name="plus" size={16} />
        <input
          ref={addRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={task.steps.length ? 'Add another step' : 'Break it into smaller steps'}
          aria-label="New step"
          maxLength={300}
        />
      </form>
    </div>
  )
}
