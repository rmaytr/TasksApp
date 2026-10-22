import { useEffect } from 'react'
import { parseImport } from '../lib/import'
import { SAMPLE_TEXT } from '../model/defaults'
import { useStore } from '../store/useStore'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { planImport } from './importPlan'
import { Logo } from './Logo'
import './Onboarding.css'

/** First run: a real modal, so nothing behind it can be clicked until you pick a start. */
/** StrictMode runs effects twice in dev; load the sample once. */
let sampleLoaded = false

export function Onboarding() {
  const show = useStore((s) => !s.prefs.onboarded && s.tasks.length === 0)
  const setPrefs = useStore((s) => s.setPrefs)
  const setImportOpen = useStore((s) => s.setImportOpen)
  const addTasks = useStore((s) => s.addTasks)
  const areas = useStore((s) => s.areas)

  const finish = (): void => setPrefs({ onboarded: true })
  const loadSample = (): void => {
    const { drafts } = parseImport(SAMPLE_TEXT, new Date())
    const { rows, newAreas } = planImport(drafts, areas)
    addTasks(rows.map((r) => ({ draft: r.draft, areaId: r.areaId })), { newAreas })
  }

  // Dev only: `?sample` skips the welcome with sample tasks, so screenshot tools see real screens.
  useEffect(() => {
    if (!import.meta.env.DEV || !show || sampleLoaded || !new URLSearchParams(location.search).has('sample')) return
    sampleLoaded = true
    loadSample()
    finish()
    // Runs once when the welcome would first show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  return (
    <Dialog open={show} onClose={finish} title="Welcome to Cairn">
      {show && (
        <div className="dialog__body onboard">
          <div className="onboard__mark" aria-hidden="true">
            <Logo size={56} />
          </div>
          <p className="onboard__lead">Get everything out of your head and into one calm place.</p>
          <ul className="onboard__points">
            <li>
              <Icon name="sparkle" size={18} /> Type a task the way you'd say it. Cairn works out the area, the date and the
              priority.
            </li>
            <li>
              <Icon name="home" size={18} /> Today shows one thing to do next, not a wall of to-dos.
            </li>
            <li>
              <Icon name="bell" size={18} /> Gentle reminders before deadlines. Nothing turns red.
            </li>
          </ul>
          <div className="onboard__actions">
            <button
              type="button"
              className="btn btn--primary btn--lg"
              data-autofocus
              onClick={() => {
                finish()
                setImportOpen(true)
              }}
            >
              <Icon name="import" size={18} /> Import my list
            </button>
            <button type="button" className="btn btn--lg" onClick={loadSample}>
              Try with sample tasks
            </button>
            <button type="button" className="btn btn--ghost btn--lg" onClick={finish}>
              Start fresh
            </button>
          </div>
          <p className="onboard__fine">Free, no sign-up. Your tasks stay on this device.</p>
        </div>
      )}
    </Dialog>
  )
}
