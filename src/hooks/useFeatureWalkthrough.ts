/**
 * useFeatureWalkthrough - tracks first-run walkthrough completion.
 */
import { useEffect, useState } from 'react';

export const WALKTHROUGH_KEY = 'ks_walkthrough_complete';

export function useFeatureWalkthrough() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(WALKTHROUGH_KEY) === 'true';
    if (!done) {
      // Small delay so target DOM nodes have rendered.
      const id = setTimeout(() => setShouldShow(true), 900);
      return () => clearTimeout(id);
    }
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
