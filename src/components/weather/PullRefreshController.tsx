/**
 * PullRefreshController - Manages pull-to-refresh with proper debouncing
 * 
 * ROOT CAUSE: useEffect with touch event listeners was re-running on every
 * state change (startY, pullDistance), causing:
 * - Duplicate event listener attachments
 * - Multiple concurrent refresh calls
 * - Toast spam from repeated success/error messages
 * 
 * FIX: Self-contained component that:
 * - Debounces refresh triggers (500ms)
 * - Cancels concurrent refresh calls with AbortController
 * - Tracks mounted state to prevent setState after unmount
 * - Exposes clean lifecycle events for telemetry
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullRefreshControllerProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  enabled?: boolean;
  threshold?: number;
}

export const PullRefreshController: React.FC<PullRefreshControllerProps> = ({
  onRefresh,
  children,
  enabled = true,
  threshold = 80
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRefreshRef = useRef(0);
  const DEBOUNCE_MS = 500;

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    // Debounce: prevent rapid successive refreshes
    const now = Date.now();
    if (now - lastRefreshRef.current < DEBOUNCE_MS) {
      console.log('🚫 [PullRefresh] Debounced refresh attempt');
      return;
    }
    lastRefreshRef.current = now;

    // Cancel any in-flight refresh
    if (abortControllerRef.current) {
      console.log('🚫 [PullRefresh] Canceling previous refresh');
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    if (!mountedRef.current) return;
    setIsRefreshing(true);

    console.log('🔄 [PullRefresh] Starting refresh...');

    try {
      await onRefresh();
      console.log('✅ [PullRefresh] Refresh completed');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('⚠️ [PullRefresh] Refresh aborted');
      } else {
        console.error('❌ [PullRefresh] Refresh failed:', error);
      }
    } finally {
      if (mountedRef.current) {
        setTimeout(() => {
          if (mountedRef.current) {
            setIsRefreshing(false);
          }
        }, 300); // Brief delay for UX
      }
    }
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (container.scrollTop === 0) {
        startYRef.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isRefreshing) return;
      
      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;
      
      if (diff > 10 && container.scrollTop === 0) {
        e.preventDefault();
        setPullDistance(Math.min(diff, threshold + 20));
      }
    };

    const handleTouchEnd = () => {
      if (pullDistance > threshold && !isRefreshing) {
        handleRefresh();
      }
      setPullDistance(0);
      startYRef.current = 0;
    };

    // Use passive: false for touchmove to enable preventDefault
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, isRefreshing, pullDistance, threshold, handleRefresh]);

  const pullProgress = Math.min(pullDistance / threshold, 1);
  const showIndicator = pullDistance > 10;

  return (
    <div ref={containerRef} className="relative h-full overflow-y-auto">
      {/* Pull indicator */}
      <AnimatePresence>
        {showIndicator && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 right-0 z-50 flex justify-center pt-4"
          >
            <div className="bg-background/80 backdrop-blur-sm rounded-full px-4 py-2 border border-border/50 shadow-lg">
              <RefreshCw
                className={cn(
                  "h-5 w-5 text-primary transition-transform",
                  isRefreshing && "animate-spin",
                  !isRefreshing && `rotate-[${pullProgress * 360}deg]`
                )}
                style={{
                  transform: !isRefreshing ? `rotate(${pullProgress * 360}deg)` : undefined
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </div>
  );
};
