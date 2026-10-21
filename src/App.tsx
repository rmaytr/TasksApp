import { useCloud, useHashView, useShortcuts, useStorageErrors, useTheme } from './appEffects'
import { useReminders } from './reminders/useReminders'
import { AccountDialog } from './components/AccountDialog'
import { FocusView } from './components/FocusView'
import { HomeView } from './components/HomeView'
import { ImportDialog } from './components/ImportDialog'
import { BottomNav, Sidebar } from './components/Navigation'
import { NewAreaDialog } from './components/NewAreaDialog'
import { Onboarding } from './components/Onboarding'
import { QuickAddDialog } from './components/QuickAddDialog'
import { QuickFind } from './components/QuickFind'
import { ResetView } from './components/ResetView'
import { SettingsDialog } from './components/SettingsDialog'
import { TaskDetail } from './components/TaskDetail'
import { TasksView } from './components/TasksView'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { useStore } from './store/useStore'
import './App.css'

export default function App() {
  const hydrated = useStore((s) => s.hydrated)
  const view = useStore((s) => s.view)
  useTheme()
  useHashView()
  useShortcuts()
  useStorageErrors()
  useCloud()
  useReminders()

  if (!hydrated) return <div className="splash" aria-busy="true" aria-label="Loading your tasks" />

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          // The hash is the router; jump focus without changing the route.
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        Skip to content
      </a>
      <Sidebar />
      <main className="main" id="main" tabIndex={-1}>
        <TopBar />
        <div className="stage" data-view={view}>
          {view === 'home' && <HomeView />}
          {view === 'tasks' && <TasksView />}
          {view === 'focus' && <FocusView />}
          {view === 'reset' && <ResetView />}
        </div>
      </main>
      <TaskDetail />
      <BottomNav />
      <QuickAddDialog />
      <ImportDialog />
      <SettingsDialog />
      <NewAreaDialog />
      <AccountDialog />
      <QuickFind />
      <Onboarding />
      <Toast />
    </div>
  )
}
