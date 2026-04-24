import { useEffect, useState } from 'react';

/**
 * Detects whether the user prefers reduced motion OR is on a low-end device.
 * Used to conditionally skip heavy framer-motion decorations on the Home page
 * to keep low-end Android phones smooth.
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mql.matches) return true;
    } catch {
      /* ignore */
    }
    // Heuristic: low-memory or low-core devices
    const nav: any = typeof navigator !== 'undefined' ? navigator : {};
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true;
    if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) return true;
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    const handler = () => setReduce(mql.matches);
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler);
      else mql.removeListener(handler);
    };
  }, []);

  return reduce;
}
