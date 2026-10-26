import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Route, Routes } from 'react-router-dom';
import { db } from './db';
import Onboarding from './screens/Onboarding';
import Today from './screens/Today';
import Workout from './screens/Workout';
import Food from './screens/Food';
import Progress from './screens/Progress';
import Review from './screens/Review';
import SettingsScreen from './screens/Settings';

const icons = {
  today: <path d="M4 7h16M4 12h16M4 17h10" />,
  food: <path d="M7 3v8a3 3 0 0 0 6 0V3M10 3v18M17 3c-1.7 1.3-2.5 3.3-2.5 6s.8 4 2.5 4v8" />,
  progress: <path d="M4 19 10 12l4 4 6-9" />,
  review: <path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3.5" />,
};

function Nav() {
  const item = (to: string, label: string, icon: keyof typeof icons) => (
    <NavLink to={to} end={to === '/'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icons[icon]}
      </svg>
      {label}
    </NavLink>
  );
  return (
    <nav className="nav" aria-label="Main">
      {item('/', 'Today', 'today')}
      {item('/food', 'Food', 'food')}
      {item('/progress', 'Progress', 'progress')}
      {item('/review', 'Review', 'review')}
      {item('/settings', 'More', 'more')}
    </nav>
  );
}

export default function App() {
  // undefined while loading, null when there is no profile yet.
  const settings = useLiveQuery(async () => (await db.settings.get('me')) ?? null);
  if (settings === undefined) return null;
  if (settings === null) return <main className="app"><Onboarding /></main>;
  return (
    <>
      <main className="app">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/workout/:id" element={<Workout />} />
          <Route path="/food" element={<Food />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/review" element={<Review />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
      </main>
      <Nav />
    </>
  );
}
