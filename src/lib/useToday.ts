import { useEffect, useState } from 'react';
import { todayISO } from './format';

/** Today's local date; updates past midnight and when the app returns to the foreground. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const tick = () => setToday(todayISO());
    const id = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return today;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
