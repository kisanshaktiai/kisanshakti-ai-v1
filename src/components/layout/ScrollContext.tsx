import { createContext, useContext, RefObject } from 'react';

/**
 * ScrollContext exposes the ref of the single app-wide scroll container
 * (`<main className="mobile-scroll-container">` in AppLayout).
 *
 * Pages should NEVER create their own scroll container. Instead, if they need
 * to react to scroll position (e.g. show a back-to-top FAB, hide bottom nav,
 * shrink header), they read this ref and attach scroll listeners to it.
 */
export const ScrollContext = createContext<RefObject<HTMLElement> | null>(null);

export const useAppScrollRef = () => useContext(ScrollContext);
