/**
 * VoiceFocusHighlight - Highlights focused/active element during voice interaction
 * Provides visual feedback for voice-controlled navigation
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

interface VoiceFocusHighlightProps {
  targetElement: HTMLElement | null;
  isActive: boolean;
  color?: string;
}

export const VoiceFocusHighlight: React.FC<VoiceFocusHighlightProps> = ({
  targetElement,
  isActive,
  color = 'rgb(34, 197, 94)', // green-500
}) => {
  const [bounds, setBounds] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!targetElement || !isActive) {
      setBounds(null);
      return;
    }

    const updateBounds = () => {
      const rect = targetElement.getBoundingClientRect();
      setBounds(rect);
    };

    // Initial bounds
    updateBounds();

    // Update on scroll/resize
    window.addEventListener('scroll', updateBounds, true);
    window.addEventListener('resize', updateBounds);

    // Observer for element changes
    const observer = new MutationObserver(updateBounds);
    observer.observe(targetElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      window.removeEventListener('scroll', updateBounds, true);
      window.removeEventListener('resize', updateBounds);
      observer.disconnect();
    };
  }, [targetElement, isActive]);

  if (!bounds || !isActive) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'fixed',
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      >
        {/* Outer glow */}
        <motion.div
          animate={{
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute inset-0 rounded-lg"
          style={{
            boxShadow: `0 0 0 4px ${color}40, 0 0 20px ${color}60`,
          }}
        />

        {/* Inner border */}
        <div
          className="absolute inset-0 rounded-lg border-2"
          style={{
            borderColor: color,
          }}
        />

        {/* Corner accents */}
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => {
          const isTop = corner.includes('top');
          const isLeft = corner.includes('left');
          
          return (
            <motion.div
              key={corner}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1 }}
              className="absolute w-4 h-4"
              style={{
                [isTop ? 'top' : 'bottom']: -2,
                [isLeft ? 'left' : 'right']: -2,
                borderTop: isTop ? `2px solid ${color}` : 'none',
                borderBottom: !isTop ? `2px solid ${color}` : 'none',
                borderLeft: isLeft ? `2px solid ${color}` : 'none',
                borderRight: !isLeft ? `2px solid ${color}` : 'none',
              }}
            />
          );
        })}

        {/* Pulse effect */}
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
            opacity: [0.3, 0, 0.3],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          className="absolute inset-0 rounded-lg"
          style={{
            backgroundColor: color,
            opacity: 0.1,
          }}
        />
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

/**
 * Hook to manage voice focus highlighting
 */
export const useVoiceFocus = () => {
  const [focusedElement, setFocusedElement] = useState<HTMLElement | null>(null);
  const [isActive, setIsActive] = useState(false);

  const highlightElement = (element: HTMLElement | null, duration?: number) => {
    setFocusedElement(element);
    setIsActive(!!element);

    if (duration && element) {
      setTimeout(() => {
        setIsActive(false);
        setFocusedElement(null);
      }, duration);
    }
  };

  const clearHighlight = () => {
    setFocusedElement(null);
    setIsActive(false);
  };

  return {
    focusedElement,
    isActive,
    highlightElement,
    clearHighlight,
  };
};
