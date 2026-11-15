import { Component, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Dumbbell, Home as HomeIcon, LineChart, User, Utensils, WifiOff } from 'lucide-react'
import { Dialogs, ToastProvider, cx } from './components/ui'
import { StoreProvider, useStore } from './lib/store'
import { AuthScreen, RecoveryScreen } from './pages/Auth'
import Home from './pages/Home'
import Workouts from './pages/Workouts'
import EditSchedule from './pages/EditSchedule'
import SessionPage from './pages/Session'
import Food from './pages/Food'
import Progress from './pages/Progress'
import Photos from './pages/Photos'
import Compare from './pages/Compare'
import CalendarPage from './pages/CalendarPage'
import Day from './pages/Day'
import Profile from './pages/Profile'
import Checkin from './pages/Checkin'

const NAV = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/food', label: 'Food', icon: Utensils },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/profile', label: 'Profile', icon: User },
]

class Boundary extends Component<{ children: ReactNode; k: string }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidUpdate(prev: { k: string }) { if (prev.k !== this.props.k && this.state.err) this.setState({ err: null }) }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="p-6 text-center">
        <h1 className="text-lg font-semibold mb-2">Something went wrong on this screen</h1>
        <p className="text-sm text-mute mb-4">Your saved data is safe. {this.state.err.message}</p>
        <button className="min-h-[44px] rounded-xl bg-volt text-black font-semibold px-6" onClick={() => window.location.reload()}>Reload</button>
      </div>
    )
  }
}

function Shell() {
  const { online, backend } = useStore()
  const loc = useLocation()
  return (
    <div className="mx-auto max-w-lg min-h-full pb-28 px-4 safe-t">
      {!online && (
        <div role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-warn/15 border border-warn/40 text-warn text-xs px-3 py-2">
          <WifiOff size={14} /> You're offline. {backend.mode !== 'local' ? "You can look around, but changes can't be saved until you reconnect." : 'Local data still works.'}
        </div>
      )}
      <Boundary k={loc.pathname}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/workouts" element={<Workouts />} />
          <Route path="/workouts/edit" element={<EditSchedule />} />
          <Route path="/session/:date" element={<SessionPage />} />
          <Route path="/food" element={<Food />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/photos" element={<Photos />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/day/:date" element={<Day />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/checkin" element={<Checkin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Boundary>
      <nav aria-label="Main" className="fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-line safe-b">
        <div className="mx-auto max-w-lg grid grid-cols-5">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => cx('flex flex-col items-center gap-0.5 pt-2.5 pb-1 text-[11px]', isActive ? 'text-volt' : 'text-mute')}>
              <n.icon size={22} />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <StoreProvider authScreen={<AuthScreen />} recoveryScreen={done => <RecoveryScreen done={done} />}>
        <Shell />
        <Dialogs />
      </StoreProvider>
    </ToastProvider>
  )
}
