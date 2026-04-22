import { useEffect, useState } from 'react';

/**
 * Single shared minute-tick hook.
 * Returns a Date that updates once per minute.
 * Use this in place of multiple per-component setInterval(60_000) timers
 * to avoid cascading re-renders of the entire Home tree every minute.
 */
export function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Align first tick to next minute boundary for slight efficiency
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    let interval: ReturnType<typeof setInterval> | null = null;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  return now;
}
