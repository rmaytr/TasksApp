import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { formatDue } from '../lib/dates'
import { areaColor, areaTextColor } from '../hooks'
import { effectiveHorizon, isStale } from '../model/derive'
import { HORIZON_LABEL } from '../model/types'
import { useStore } from '../store/useStore'
import { Icon } from '../components/Icon'
import type { MapMode, MapNode } from './layout'

interface MapNodeViewProps {
  node: MapNode
  mode: MapMode
  now: Date
  taskCount: number
  collapsed: boolean
  expanded: boolean
  onToggleArea: (id: string) => void
  onToggleTask: (id: string) => void
}

export function MapNodeView(props: MapNodeViewProps) {
  const { node } = props
  const style = {
    left: node.x,
    top: node.y - node.h / 2,
    width: node.w,
    height: node.h,
    '--c': areaColor(node.area),
    '--ct': areaTextColor(node.area),
  } as CSSProperties

  return (
    <li className={`mnode mnode--${node.kind}`} style={style} onPointerDown={(e) => e.stopPropagation()}>
      <NodeBody {...props} />
    </li>
  )
}

function NodeBody(props: MapNodeViewProps) {
  const { node } = props
  switch (node.kind) {
    case 'root':
      return <RootNode count={props.taskCount} />
    case 'area':
      return <AreaNode {...props} />
    case 'task':
      return <TaskNode {...props} />
    case 'step':
      return <StepNode {...props} />
    case 'add-task':
      return <AddTaskNode areaId={node.area?.id ?? ''} areaName={node.area?.name ?? ''} />
    case 'add-area':
      return <AddAreaNode />
  }
}

function RootNode({ count }: { count: number }) {
  return (
    <div className="mnode__root">
      <span className="mnode__root-count num">{count}</span>
      <span>open tasks</span>
    </div>
  )
}

function AreaNode({ node, taskCount, collapsed, onToggleArea }: MapNodeViewProps) {
  const area = node.area
  if (!area) return null
  return (
    <button
      type="button"
      className="mnode__area"
      aria-expanded={!collapsed}
      onClick={() => onToggleArea(area.id)}
      title={collapsed ? 'Show tasks' : 'Hide tasks'}
    >
      <span className="dot" />
      <span className="mnode__area-name">{area.name}</span>
      <span className="mnode__count num">{taskCount}</span>
      <span className={`mnode__caret${collapsed ? '' : ' is-open'}`}>
        <Icon name="chevron" size={14} />
      </span>
    </button>
  )
}

function TaskNode({ node, now, expanded, onToggleTask }: MapNodeViewProps) {
  const task = node.task
  const select = useStore((s) => s.select)
  const setDone = useStore((s) => s.setDone)
  if (!task) return null
  const done = task.steps.filter((s) => s.done).length
  const meta = task.due ? formatDue(task.due, now) : HORIZON_LABEL[effectiveHorizon(task, now)]
  return (
    <div className={`mnode__task${task.high ? ' is-high' : ''}${isStale(task, now) ? ' is-stale' : ''}`}>
      <input
        type="checkbox"
        className="check"
        checked={false}
        onChange={() => setDone(task.id, true)}
        aria-label={`Done: ${task.title}`}
      />
      <button type="button" className="mnode__title" onClick={() => select(task.id)} title={task.title}>
        {task.title}
      </button>
      <span className="mnode__meta num">{meta}</span>
      {task.steps.length > 0 && (
        <button
          type="button"
          className="mnode__steps num"
          aria-expanded={expanded}
          aria-label={`${done}/${task.steps.length} steps, ${expanded ? 'hide' : 'show'}`}
          onClick={() => onToggleTask(task.id)}
        >
          {done}/{task.steps.length}
          <span className={`mnode__caret${expanded ? ' is-open' : ''}`}>
            <Icon name="chevron" size={12} />
          </span>
        </button>
      )}
    </div>
  )
}

function StepNode({ node }: MapNodeViewProps) {
  const { task, step } = node
  const updateStep = useStore((s) => s.updateStep)
  if (!task || !step) return null
  return (
    <label className={`mnode__step${step.done ? ' is-done' : ''}`}>
      <input
        type="checkbox"
        className="check check--square"
        checked={step.done}
        onChange={(e) => updateStep(task.id, step.id, { done: e.target.checked })}
      />
      <span>{step.title}</span>
    </label>
  )
}

function AddTaskNode({ areaId, areaName }: { areaId: string; areaName: string }) {
  const addTask = useStore((s) => s.addTask)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const ghostRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  useEffect(() => {
    if (!editing && wasEditing.current) ghostRef.current?.focus()
    wasEditing.current = editing
  }, [editing])

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const title = text.trim()
    if (!title) return
    addTask({ title }, areaId, 'week')
    setText('')
  }

  if (!editing) {
    return (
      <button ref={ghostRef} type="button" className="mnode__ghost" onClick={() => setEditing(true)}>
        <Icon name="plus" size={14} /> Add to {areaName}
      </button>
    )
  }
  return (
    <form className="mnode__add" onSubmit={submit}>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => !text.trim() && setEditing(false)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        placeholder="New task, then Enter"
        aria-label={`New task in ${areaName}`}
        maxLength={300}
      />
    </form>
  )
}

function AddAreaNode() {
  const setNewAreaOpen = useStore((s) => s.setNewAreaOpen)
  return (
    <button type="button" className="mnode__ghost mnode__ghost--area" onClick={() => setNewAreaOpen(true)}>
      <Icon name="plus" size={16} /> New area
    </button>
  )
}
