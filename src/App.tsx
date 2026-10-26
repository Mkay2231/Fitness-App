import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { db } from './db';
import { Icon, type IconName } from './icons';
import { useOnline } from './install';
import { Loading } from './ui';
import { UnitsProvider } from './units';
import Onboarding from './screens/Onboarding';
import Today from './screens/Today';
import Train from './screens/Train';
import ProgramEditor from './screens/ProgramEditor';
import Workout from './screens/Workout';
import Food from './screens/Food';
import Progress from './screens/Progress';
import Review from './screens/Review';
import SettingsScreen from './screens/Settings';
import Help from './screens/Help';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/train', label: 'Train', icon: 'train' },
  { to: '/food', label: 'Food', icon: 'food' },
  { to: '/progress', label: 'Progress', icon: 'progress' },
  { to: '/review', label: 'Review', icon: 'review' },
];

function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand"><span className="brand-mark"><Icon name="train" size="sm" /></span>Rep Ledger</div>
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'}><Icon name={n.icon} />{n.label}</NavLink>
      ))}
      <div className="spacer" />
      <NavLink to="/help"><Icon name="help" />Help</NavLink>
      <NavLink to="/settings"><Icon name="settings" />Settings</NavLink>
    </nav>
  );
}

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'}><Icon name={n.icon} />{n.label}</NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  // undefined while loading, null when there is no profile yet.
  const settings = useLiveQuery(async () => (await db.settings.get('me')) ?? null);
  const online = useOnline();
  const { pathname } = useLocation();
  const inWorkout = pathname.startsWith('/workout/');
  if (settings === undefined) return <main className="main"><Loading label="Opening your data" /></main>;
  if (settings === null) return <main className="main"><div className="page"><Onboarding /></div></main>;
  return (
    <UnitsProvider wu={settings.weightUnit ?? 'kg'} lu={settings.lengthUnit ?? 'cm'}>
    <div className="shell">
      <Sidebar />
      <main className={`main${inWorkout ? ' has-dock' : ''}`}>
        {!online && !inWorkout && (
          <div className="page"><div className="offline" role="status"><Icon name="cloudOff" size="sm" />Offline. Everything you log is saved on this phone.</div></div>
        )}
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/train" element={<Train />} />
          <Route path="/train/edit" element={<ProgramEditor />} />
          <Route path="/workout/:id" element={<Workout />} />
          <Route path="/food" element={<Food />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/review" element={<Review />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/help" element={<Help />} />
        </Routes>
      </main>
      {/* The active workout is a focused screen: its dock replaces the tab bar on phones. */}
      {!inWorkout && <TabBar />}
    </div>
    </UnitsProvider>
  );
}
