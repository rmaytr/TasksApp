import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { areaStyle, useAreaMap, useNow } from '../hooks'
import { compareUrgency, effectiveHorizon } from '../model/derive'
import { HORIZON_LABEL, type Task } from '../model/types'
import { useStore } from '../store/useStore'
import { Dialog } from './Dialog'
import './QuickFind.css'

const MAX_RESULTS = 12

export function QuickFind() {
  const open = useStore((s) => s.quickFindOpen)
  const setOpen = useStore((s) => s.setQuickFindOpen)
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Find a task">
      {open && <FindBody onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

/** Matches every word of the query against title, notes and steps (so "lab cs" finds "CS303 lab report"). */
function score(task: Task, words: string[]): number {
  const title = task.title.toLowerCase()
  const rest = `${task.notes} ${task.steps.map((s) => s.title).join(' ')}`.toLowerCase()
  let total = 0
  for (const w of words) {
    if (title.startsWith(w)) total += 3
    else if (title.includes(w)) total += 2
    else if (rest.includes(w)) total += 1
    else return 0
  }
  return total
}

function FindBody({ onDone }: { onDone: () => void }) {
  const tasks = useStore((s) => s.tasks)
  const view = useStore((s) => s.view)
  const navigate = useStore((s) => s.navigate)
  const select = useStore((s) => s.select)
  const areaMap = useAreaMap()
  const now = useNow()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const pool = tasks.filter((t) => !t.done || words.length > 0)
    if (words.length === 0) return [...pool].sort((a, b) => compareUrgency(a, b, now)).slice(0, MAX_RESULTS)
    return pool
      .map((t) => ({ t, s: score(t, words) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || Number(a.t.done) - Number(b.t.done) || compareUrgency(a.t, b.t, now))
      .slice(0, MAX_RESULTS)
      .map((r) => r.t)
  }, [tasks, query, now])

  const current = Math.min(active, Math.max(results.length - 1, 0))
  useEffect(() => {
    const task = results[current]
    if (task) document.getElementById(`find-${task.id}`)?.scrollIntoView({ block: 'nearest' })
  }, [current, results])

  const openTask = (task: Task): void => {
    if (view === 'focus' || view === 'reset') navigate({ view: 'tasks', mode: 'list' })
    select(task.id)
    onDone()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(Math.min(current + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(current - 1, 0))
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing && results[current]) {
      e.preventDefault()
      openTask(results[current])
    }
  }

  return (
    <div className="dialog__body find">
      <input
        className="field find__input"
        autoFocus
        data-autofocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        placeholder="Type to search titles, steps and notes"
        aria-label="Search tasks"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={results.length > 0}
        aria-controls="find-results"
        aria-activedescendant={results[current] ? `find-${results[current].id}` : undefined}
      />
      <ul id="find-results" className="find__results" role="listbox" aria-label="Matching tasks">
        {results.map((task, i) => {
          const area = areaMap.get(task.areaId)
          return (
            <li
              key={task.id}
              id={`find-${task.id}`}
              role="option"
              aria-selected={i === current}
              className="find__item"
              style={areaStyle(area)}
              onMouseEnter={() => setActive(i)}
              onClick={() => openTask(task)}
            >
              <span className="dot" />
              <span className={`find__title${task.done ? ' is-done' : ''}`}>{task.title}</span>
              <span className="find__meta">
                {area?.name} · {task.done ? 'Done' : HORIZON_LABEL[effectiveHorizon(task, now)]}
              </span>
            </li>
          )
        })}
      </ul>
      {results.length === 0 && <p className="find__empty">No tasks match “{query}”.</p>}
      <p className="find__hint">
        <span className="kbd">↑</span> <span className="kbd">↓</span> to move, <span className="kbd">Enter</span> to open
      </p>
    </div>
  )
}
