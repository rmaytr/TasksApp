import { useCloud, useHashView, useShortcuts, useStorageErrors, useTheme } from './appEffects'
import { BottomNav, Rail } from './components/Navigation'
import { FocusView } from './components/FocusView'
import { ImportDialog } from './components/ImportDialog'
import { ListView } from './components/ListView'
import { ResetView } from './components/ResetView'
import { SettingsDialog } from './components/SettingsDialog'
import { TaskDetail } from './components/TaskDetail'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { Welcome } from './components/Welcome'
import { AccountDialog } from './components/AccountDialog'
import { NewAreaDialog } from './components/NewAreaDialog'
import { QuickFind } from './components/QuickFind'
import { MapView } from './map/MapView'
import { RadarView } from './radar/RadarView'
import { useStore } from './store/useStore'
import './App.css'

export default function App() {
  const hydrated = useStore((s) => s.hydrated)
  const view = useStore((s) => s.view)
  const showWelcome = useStore((s) => !s.prefs.onboarded && s.tasks.length === 0)
  useTheme()
  useHashView()
  useShortcuts()
  useStorageErrors()
  useCloud()

  if (!hydrated) return <div className="splash" aria-busy="true" aria-label="Loading your tasks" />

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Rail />
      <main className="main" id="main" tabIndex={-1}>
        <TopBar />
        <div className="stage" data-view={view}>
          {view === 'radar' && <RadarView />}
          {view === 'map' && <MapView />}
          {view === 'list' && <ListView />}
          {view === 'focus' && <FocusView />}
          {view === 'reset' && <ResetView />}
        </div>
      </main>
      <TaskDetail />
      <BottomNav />
      <ImportDialog />
      <SettingsDialog />
      <NewAreaDialog />
      <AccountDialog />
      <QuickFind />
      <Toast />
      {showWelcome && <Welcome />}
    </div>
  )
}
