import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { parseImport } from '../lib/import'
import { SAMPLE_TEXT } from '../model/defaults'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { planImport } from './importPlan'
import './Welcome.css'

export function Welcome() {
  const setPrefs = useStore((s) => s.setPrefs)
  const setImportOpen = useStore((s) => s.setImportOpen)
  const addTasks = useStore((s) => s.addTasks)
  const areas = useStore((s) => s.areas)
  const firstAction = useRef<HTMLButtonElement>(null)

  useEffect(() => firstAction.current?.focus({ preventScroll: true }), [])

  const loadSample = (): void => {
    const { drafts } = parseImport(SAMPLE_TEXT, new Date())
    const { rows, newAreas } = planImport(drafts, areas)
    addTasks(rows.map((r) => ({ draft: r.draft, areaId: r.areaId })), { newAreas })
  }

  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <motion.div
        className="welcome__card"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      >
        <h1 id="welcome-title">Everything you’re carrying, at a glance.</h1>
        <p>
          Nearer puts your to-dos on a radar: today in the middle, someday at the edge, each part of your life in its own
          slice. Pull things closer as they start to matter.
        </p>
        <p className="welcome__fine">Free, no sign-up. Your tasks never leave this device.</p>
        <div className="welcome__actions">
          <button ref={firstAction} type="button" className="btn btn--primary" onClick={() => setImportOpen(true)}>
            <Icon name="import" size={18} /> Import my list
          </button>
          <button type="button" className="btn" onClick={loadSample}>
            Try it with sample tasks
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setPrefs({ onboarded: true })
              document.getElementById('capture-input')?.focus()
            }}
          >
            Start empty
          </button>
        </div>
      </motion.div>
    </section>
  )
}
