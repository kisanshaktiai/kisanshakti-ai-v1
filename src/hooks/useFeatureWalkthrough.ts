/**
 * useFeatureWalkthrough - tracks first-run walkthrough completion.
 * Waits for at least one [data-tour] anchor to be in the DOM before
 * surfacing the tour, preventing flicker on slow first paints.
 */
import { useEffect, useState } from 'react';

export const WALKTHROUGH_KEY = 'ks_walkthrough_v2_complete';

export function useFeatureWalkthrough() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(WALKTHROUGH_KEY) === 'true';
    if (done) return;

    let cancelled = false;
    const start = Date.now();
    const poll = () => {
      if (cancelled) return;
      const ready = document.querySelector('[data-tour]') !== null;
      if (ready) {
        // Tiny settle delay so layout stabilizes
        setTimeout(() => !cancelled && setShouldShow(true), 250);
        return;
      }
      if (Date.now() - start > 3000) {
        // Fall back: show anyway, centered modal will handle missing targets
        setShouldShow(true);
        return;
      }
      setTimeout(poll, 150);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = () => {
    localStorage.setItem(WALKTHROUGH_KEY, 'true');
    setShouldShow(false);
  };

  const reset = () => {
    localStorage.removeItem(WALKTHROUGH_KEY);
    setShouldShow(true);
  };

  return { shouldShow, finish, reset };
}
