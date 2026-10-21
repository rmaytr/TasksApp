import { useMemo, useRef, useState, type DragEvent } from 'react'
import { parseImport, type ImportFormat } from '../lib/import'
import { areaStyle, useNow } from '../hooks'
import { HORIZON_LABEL, type Area } from '../model/types'
import { useStore } from '../store/useStore'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { MAX_IMPORT_BYTES, planImport, type PreviewRow } from './importPlan'
import './ImportDialog.css'

const FORMAT_LABEL: Record<ImportFormat, string> = {
  text: 'plain text',
  markdown: 'Markdown',
  json: 'JSON',
  csv: 'CSV',
}

const PASTE_HINT = `Paste anything, one task per line:

Apply for internships on Handshake !
Finish lab report #classes fri
Plan club social: book room, send poll, buy snacks`

export function ImportDialog() {
  const open = useStore((s) => s.importOpen)
  const setOpen = useStore((s) => s.setImportOpen)
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Import tasks" wide>
      {open && <ImportFlow onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

interface Preview {
  format: ImportFormat
  warnings: string[]
  rows: PreviewRow[]
  newAreas: Area[]
}

function ImportFlow({ onDone }: { onDone: () => void }) {
  const areas = useStore((s) => s.areas)
  const hasTasks = useStore((s) => s.tasks.length > 0)
  const addTasks = useStore((s) => s.addTasks)
  const now = useNow()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [replace, setReplace] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const build = (source: string, name?: string): void => {
    try {
      const result = parseImport(source, now, name)
      if (result.drafts.length === 0) {
        setError('No tasks found. Put one task per line, or use a Markdown checklist.')
        return
      }
      const plan = planImport(result.drafts, areas)
      setPreview({ format: result.format, warnings: result.warnings, ...plan })
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That file could not be read.')
    }
  }

  const readFile = async (file: File): Promise<void> => {
    if (file.size > MAX_IMPORT_BYTES) {
      setError('That file is over 2 MB. Split it into smaller files.')
      return
    }
    try {
      const content = await file.text()
      setText(content)
      setFileName(file.name)
      build(content, file.name)
    } catch {
      setError(`Couldn't read ${file.name}.`)
    }
  }

  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void readFile(file)
  }

  if (preview) {
    return (
      <PreviewStep
        preview={preview}
        areas={[...areas, ...preview.newAreas]}
        hasTasks={hasTasks}
        replace={replace}
        onReplace={setReplace}
        onChange={(rows) => setPreview({ ...preview, rows })}
        onBack={() => setPreview(null)}
        onCommit={() => {
          const chosen = preview.rows.filter((r) => r.include)
          const used = new Set(chosen.map((r) => r.areaId))
          addTasks(
            chosen.map((r) => ({ draft: r.draft, areaId: r.areaId })),
            { replace, newAreas: preview.newAreas.filter((a) => used.has(a.id)) },
          )
          onDone()
        }}
      />
    )
  }

  return (
    <>
      <div className="dialog__body">
        <div
          className={`drop${dragOver ? ' is-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <textarea
            className="field drop__text"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setFileName(undefined)
            }}
            placeholder={PASTE_HINT}
            rows={10}
            aria-label="Paste tasks"
          />
          <div className="drop__file">
            <span>or drop a file here:</span>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="import" size={18} /> Choose file
            </button>
            <span className="drop__formats">.txt, .md, .json, .csv (Todoist exports too)</span>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.markdown,.json,.csv,text/plain,text/markdown,application/json,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void readFile(file)
                e.target.value = ''
              }}
            />
          </div>
        </div>
        <details className="import__help">
          <summary>What the importer understands</summary>
          <ul>
            <li>
              <code>Title: step one, step two</code> becomes a task with steps. Indented lines under a task become steps too.
            </li>
            <li>
              A line ending in a colon, like <code>Career:</code>, or a Markdown <code>## Career</code> heading puts the
              lines below it in that area.
            </li>
            <li>
              <code>#area</code>, <code>!</code> for high priority, dates like <code>fri</code>, <code>nov 3</code> or{' '}
              <code>in 2 weeks</code>, and rings like <code>@week</code> or <code>@someday</code>.
            </li>
            <li>Areas are guessed from the words when you don’t say one. You can fix any guess on the next screen.</li>
          </ul>
        </details>
        {error && (
          <p className="import__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="dialog__foot">
        <button type="button" className="btn btn--primary" disabled={!text.trim()} onClick={() => build(text, fileName)}>
          Preview import
        </button>
      </footer>
    </>
  )
}

interface PreviewStepProps {
  preview: Preview
  areas: Area[]
  hasTasks: boolean
  replace: boolean
  onReplace: (v: boolean) => void
  onChange: (rows: PreviewRow[]) => void
  onBack: () => void
  onCommit: () => void
}

function PreviewStep({ preview, areas, hasTasks, replace, onReplace, onChange, onBack, onCommit }: PreviewStepProps) {
  const count = preview.rows.filter((r) => r.include).length
  const groups = useMemo(
    () => areas.map((a) => ({ area: a, rows: preview.rows.filter((r) => r.areaId === a.id) })).filter((g) => g.rows.length),
    [areas, preview.rows],
  )
  const patch = (key: string, change: Partial<PreviewRow>): void =>
    onChange(preview.rows.map((r) => (r.key === key ? { ...r, ...change, guessed: false } : r)))

  return (
    <>
      <div className="dialog__body">
        <p className="import__summary num">
          Found {preview.rows.length} {preview.rows.length === 1 ? 'task' : 'tasks'} in {FORMAT_LABEL[preview.format]}.
          Dashed areas were guessed — change any that are wrong.
        </p>
        {preview.warnings.length > 0 && (
          <ul className="import__warnings">
            {preview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {groups.map(({ area, rows }) => (
          <section key={area.id} className="pv" style={areaStyle(area)}>
            <h3 className="pv__head">
              <span className="dot" /> {area.name} <span className="num">{rows.length}</span>
            </h3>
            <ul className="pv__rows">
              {rows.map((row) => (
                <li key={row.key} className={`pv__row${row.include ? '' : ' is-off'}`}>
                  <input
                    type="checkbox"
                    className="check check--square"
                    checked={row.include}
                    onChange={(e) => patch(row.key, { include: e.target.checked })}
                    aria-label={`Include ${row.draft.title}`}
                  />
                  <span className="pv__title">
                    {row.draft.title}
                    {(row.draft.steps?.length ?? 0) > 0 && (
                      <span className="pv__steps">
                        {row.draft.steps?.map((s) => s.title).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="pv__meta">
                    {row.draft.high && <span className="tag tag--high">High</span>}
                    {row.draft.horizon && <span className="tag">{HORIZON_LABEL[row.draft.horizon]}</span>}
                    {row.draft.due && <span className="tag num">{row.draft.due}</span>}
                  </span>
                  <select
                    className={`pv__area${row.guessed ? ' is-guess' : ''}`}
                    value={row.areaId}
                    onChange={(e) => patch(row.key, { areaId: e.target.value })}
                    aria-label={`Area for ${row.draft.title}`}
                  >
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <footer className="dialog__foot">
        {hasTasks && (
          <label className="import__replace">
            <input type="checkbox" className="check check--square" checked={replace} onChange={(e) => onReplace(e.target.checked)} />
            Replace my current tasks
          </label>
        )}
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn--primary" disabled={count === 0} onClick={onCommit}>
          Add {count} {count === 1 ? 'task' : 'tasks'}
        </button>
      </footer>
    </>
  )
}
