import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppScrollRef } from './ScrollContext';
import { cn } from '@/lib/utils';

interface ScrollToTopFabProps {
  threshold?: number;
  className?: string;
}

/**
 * Floating "back to top" button. Appears once the main scroller passes
 * `threshold` pixels. Tapping smooth-scrolls the main container to top.
 *
 * Positioned above the bottom navigation and to the left of the voice FAB.
 */
export function ScrollToTopFab({ threshold = 400, className }: ScrollToTopFabProps) {
  const scrollRef = useAppScrollRef();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setVisible(el.scrollTop > threshold);
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [scrollRef, threshold]);

  const handleClick = () => {
    scrollRef?.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          aria-label="Scroll to top"
          onClick={handleClick}
          initial={{ opacity: 0, scale: 0.6, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className={cn(
            'fixed bottom-24 left-4 z-30 flex h-11 w-11 items-center justify-center',
            'rounded-full bg-card/90 backdrop-blur-md border border-border/60',
            'shadow-lg active:scale-95 transition-transform',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            className,
          )}
        >
          <ChevronUp className="h-5 w-5 text-foreground" strokeWidth={2.25} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
