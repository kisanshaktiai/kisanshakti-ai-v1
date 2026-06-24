/**
 * SpeakerButton - Reusable TTS speaker button component
 * Features: Instant feedback, loading state, speaking animation
 */

import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, Pause, Play, Loader2, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTTS } from '@/hooks/useTTS';
import { useTTSSettingsStore } from '@/stores/ttsSettingsStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface SpeakerButtonProps {
  /** Unique ID for this message/content */
  messageId: string;
  /** Text content to speak */
  content: string;
  /** Override language (optional) */
  language?: string;
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
  /** Show stop button when playing */
  showStopButton?: boolean;
  /** Callback when playing state changes */
  onPlayStateChange?: (isPlaying: boolean) => void;
}

const sizeMap = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

const iconSizeMap = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function SpeakerButton({
  messageId,
  content,
  language,
  size = 'md',
  className,
  showStopButton = true,
  onPlayStateChange,
}: SpeakerButtonProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  
  // Store state
  const currentMessageId = useTTSSettingsStore((s) => s.currentMessageId);
  const setCurrentMessageId = useTTSSettingsStore((s) => s.setCurrentMessageId);
  const isPausedStore = useTTSSettingsStore((s) => s.isPaused);
  const setPausedStore = useTTSSettingsStore((s) => s.setPaused);
  const isEnabled = useTTSSettingsStore((s) => s.isEnabled);

  // TTS hook
  const { speak, stop, pause, resume, isSpeaking, isLoading, isSupported } = useTTS({
    language,
    onStart: () => {
      onPlayStateChange?.(true);
    },
    onEnd: () => {
      setCurrentMessageId(null);
      onPlayStateChange?.(false);
    },
    onError: () => {
      setCurrentMessageId(null);
      onPlayStateChange?.(false);
    },
  });

  const isThisActive = currentMessageId === messageId && (isSpeaking || isLoading);
  const isThisPaused = isThisActive && isPausedStore;

  const handlePlay = useCallback(async () => {
    // Stop any other playing message
    if (currentMessageId && currentMessageId !== messageId) {
      stop();
    }
    
    setCurrentMessageId(messageId);
    await speak(content);
  }, [content, currentMessageId, messageId, setCurrentMessageId, speak, stop]);

  const handlePause = useCallback(() => {
    pause();
    setPausedStore(true);
  }, [pause, setPausedStore]);

  const handleResume = useCallback(() => {
    resume();
    setPausedStore(false);
  }, [resume, setPausedStore]);

  const handleStop = useCallback(() => {
    stop();
    setCurrentMessageId(null);
    onPlayStateChange?.(false);
  }, [stop, setCurrentMessageId, onPlayStateChange]);

  const handleClick = useCallback(() => {
    if (isThisActive) {
      if (isLoading) {
        handleStop();
      } else if (isThisPaused) {
        handleResume();
      } else {
        handlePause();
      }
    } else {
      handlePlay();
    }
  }, [isThisActive, isLoading, isThisPaused, handleStop, handleResume, handlePause, handlePlay]);

  // Don't render if TTS not supported or disabled
  if (!isSupported || !isEnabled) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className={cn(sizeMap[size], 'opacity-30 cursor-not-allowed', className)}
        title={t('chat.tts.notSupported', 'Voice not available')}
        aria-label={t('chat.tts.notSupported', 'Voice not available')}
      >
        <VolumeX className={iconSizeMap[size]} />
      </Button>
    );
  }

  return (
    <div 
      className="relative inline-flex items-center gap-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Button */}
      <motion.div className="relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClick}
          className={cn(
            sizeMap[size],
            'relative hover:bg-muted/50 hover:scale-110 transition-all',
            isThisActive && 'text-primary',
            className
          )}
          aria-label={
            isThisActive
              ? isThisPaused
                ? t('chat.tts.resume', 'Resume')
                : t('chat.tts.pause', 'Pause')
              : t('chat.tts.play', 'Listen')
          }
        >
          <AnimatePresence mode="wait">
            {isLoading && currentMessageId === messageId ? (
              <motion.div
                key="loading"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
              >
                <Loader2 className={cn(iconSizeMap[size], 'animate-spin')} />
              </motion.div>
            ) : isThisActive && isSpeaking ? (
              isThisPaused ? (
                <motion.div
                  key="play"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <Play className={cn(iconSizeMap[size], 'fill-current')} />
                </motion.div>
              ) : (
                <motion.div
                  key="pause"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <Pause className={cn(iconSizeMap[size], 'fill-current')} />
                </motion.div>
              )
            ) : (
              <motion.div
                key="speaker"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <Volume2 className={iconSizeMap[size]} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pulse animation when active */}
          {isThisActive && !isThisPaused && (
            <motion.div
              className="absolute inset-0 rounded-md bg-primary/20 -z-10"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: isLoading ? 0.8 : 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
        </Button>
      </motion.div>

      {/* Stop Button */}
      <AnimatePresence>
        {showStopButton && (isThisActive || isHovered) && isThisActive && (
          <motion.div
            initial={{ opacity: 0, x: -10, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStop}
              className={cn(
                size === 'sm' ? 'h-5 w-5' : 'h-7 w-7',
                'hover:bg-destructive/10 hover:text-destructive transition-all'
              )}
              title={t('chat.tts.stop', 'Stop')}
              aria-label={t('chat.tts.stop', 'Stop')}
            >
              <Square className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SpeakerButton;
