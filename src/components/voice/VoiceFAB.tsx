/**
 * VoiceFAB - Persistent floating action button for voice input
 * 2030-ready mobile-first design with visual feedback
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceFABProps {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing?: boolean;
  confidence?: number;
  onToggle: () => void;
  position?: 'bottom-right' | 'bottom-center' | 'bottom-left';
  showConfidence?: boolean;
  className?: string;
}

export const VoiceFAB: React.FC<VoiceFABProps> = ({
  isListening,
  isSpeaking,
  isProcessing = false,
  confidence = 0,
  onToggle,
  position = 'bottom-right',
  showConfidence = true,
  className,
}) => {
  const [pulseCount, setPulseCount] = useState(0);

  useEffect(() => {
    if (isListening) {
      const interval = setInterval(() => {
        setPulseCount(prev => (prev + 1) % 3);
      }, 600);
      return () => clearInterval(interval);
    }
  }, [isListening]);

  const getPositionClasses = () => {
    switch (position) {
      case 'bottom-center':
        return 'bottom-6 left-1/2 -translate-x-1/2';
      case 'bottom-left':
        return 'bottom-6 left-6';
      case 'bottom-right':
      default:
        return 'bottom-6 right-6';
    }
  };

  const getStatusColor = () => {
    if (isListening) return 'from-success to-success';
    if (isSpeaking) return 'from-info to-info';
    if (isProcessing) return 'from-warning to-warning';
    return 'from-primary to-primary-foreground';
  };

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      className={cn(
        'fixed z-50',
        getPositionClasses(),
        className
      )}
    >
      <div className="relative">
        {/* Pulse rings when listening */}
        <AnimatePresence>
          {isListening && (
            <>
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{
                    scale: [1, 2.5],
                    opacity: [0.6, 0],
                  }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    delay: i * 0.6,
                    ease: 'easeOut',
                  }}
                  className={cn(
                    'absolute inset-0 rounded-full',
                    'bg-gradient-to-br from-success to-success',
                  )}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        {/* Main FAB button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          onClick={onToggle}
          className={cn(
            'relative w-16 h-16 rounded-full shadow-2xl',
            'bg-gradient-to-br',
            getStatusColor(),
            'flex items-center justify-center',
            'focus:outline-none focus:ring-4 focus:ring-primary/30',
            'transition-all duration-300',
            isListening && 'ring-4 ring-success/50 shadow-success/30/50',
            isSpeaking && 'ring-4 ring-info/50 shadow-info/30/50'
          )}
          aria-label={isListening ? 'Stop listening' : 'Start voice input'}
        >
          {/* Icon */}
          <motion.div
            animate={{
              rotate: isProcessing ? 360 : 0,
            }}
            transition={{
              duration: 1,
              repeat: isProcessing ? Infinity : 0,
              ease: 'linear',
            }}
          >
            {isProcessing ? (
              <Loader2 className="w-7 h-7 text-white" />
            ) : isListening ? (
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Mic className="w-7 h-7 text-white" />
              </motion.div>
            ) : (
              <MicOff className="w-7 h-7 text-white" />
            )}
          </motion.div>

          {/* Speaking indicator */}
          <AnimatePresence>
            {isSpeaking && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="flex space-x-1">
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        height: ['8px', '16px', '8px'],
                      }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: i * 0.2,
                      }}
                      className="w-1 bg-white rounded-full"
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Confidence indicator */}
        <AnimatePresence>
          {showConfidence && isListening && confidence > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap"
            >
              <div className="bg-background/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-lg border border-border">
                <span className="text-xs font-medium">
                  {Math.round(confidence * 100)}%
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status badge */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1"
        >
          <div
            className={cn(
              'w-4 h-4 rounded-full border-2 border-background',
              isListening && 'bg-success animate-pulse',
              isSpeaking && 'bg-info animate-pulse',
              !isListening && !isSpeaking && 'bg-muted'
            )}
          />
        </motion.div>
      </div>
    </motion.div>
  );
};
