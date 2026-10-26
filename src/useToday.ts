// Today's date that stays correct if the app is left open past midnight:
// it re-checks at midnight and whenever you come back to the app.

import { useEffect, useState } from 'react';
import { today } from './data';

export function useToday(): string {
  const [date, setDate] = useState(today);
  useEffect(() => {
    const refresh = () => setDate(today());
    const now = new Date();
    const msToMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1).getTime() - now.getTime();
    const timer = setTimeout(refresh, msToMidnight);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [date]);
  return date;
}
