import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, Pause, Play, Square, Settings2, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdvancedTextToSpeech } from '@/hooks/useAdvancedTextToSpeech';
import { useTTSStore } from '@/stores/ttsStore';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { TTSSettingsModal } from './TTSSettingsModal';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface EnhancedSpeakerButtonProps {
  messageId: string;
  content: string;
  language: string;
  isPlaying?: boolean;
  onPlayStateChange?: (playing: boolean) => void;
  className?: string;
}

export function EnhancedSpeakerButton({
  messageId,
  content,
  language,
  isPlaying: externalIsPlaying,
  onPlayStateChange,
  className
}: EnhancedSpeakerButtonProps) {
  const { t } = useTranslation();
  const store = useTTSStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isPaused,
    isSupported,
    currentSentence,
    progress,
    fallbackLanguage,
    sentences
  } = useAdvancedTextToSpeech({
    language,
    onEnd: () => {
      store.setCurrentlyPlaying(null);
      onPlayStateChange?.(false);
    },
    onError: (error) => {
      console.error('[TTS] Error:', error);
      store.setCurrentlyPlaying(null);
      onPlayStateChange?.(false);
    }
  });

  // Sync with external playing state
  useEffect(() => {
    if (externalIsPlaying && !isSpeaking) {
      handlePlay();
    } else if (!externalIsPlaying && isSpeaking) {
      handleStop();
    }
  }, [externalIsPlaying]);

  const handlePlay = async () => {
    // Stop any other playing message
    if (store.currentlyPlaying && store.currentlyPlaying !== messageId) {
      window.speechSynthesis.cancel();
    }

    store.setCurrentlyPlaying(messageId);
    onPlayStateChange?.(true);
    await speak(content);
  };

  const handlePause = () => {
    pause();
    store.setPaused(true);
  };

  const handleResume = () => {
    resume();
    store.setPaused(false);
  };

  const handleStop = () => {
    stop();
    store.setCurrentlyPlaying(null);
    onPlayStateChange?.(false);
  };

  const getFallbackLanguageName = (code: string | null): string => {
    if (!code) return '';
    const names: Record<string, string> = {
      'hi': 'हिंदी में बोल रहा हूं',
      'mr': 'मराठीत बोलत आहे',
      'en': 'Speaking in English'
    };
    return names[code] || code;
  };

  // Don't render if TTS not supported
  if (!isSupported) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className={cn("h-7 w-7 opacity-30 cursor-not-allowed", className)}
        title={t('chat.tts.notSupported', 'Text-to-speech not supported')}
      >
        <VolumeX className="h-3.5 w-3.5" />
      </Button>
    );
  }

  const isThisMessagePlaying = isSpeaking && store.currentlyPlaying === messageId;

  return (
    <div className="relative inline-flex items-center gap-1">
      {/* Main Speaker Button */}
      <motion.div
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        className="relative"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (isThisMessagePlaying) {
              if (isPaused) {
                handleResume();
              } else {
                handlePause();
              }
            } else {
              handlePlay();
            }
          }}
          className={cn(
            "h-8 w-8 relative hover:bg-muted/50 hover:scale-110 transition-all",
            isThisMessagePlaying && "text-primary",
            className
          )}
        >
          <AnimatePresence mode="wait">
            {isThisMessagePlaying ? (
              isPaused ? (
                <motion.div
                  key="play"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 90 }}
                >
                  <Play className="h-4 w-4 fill-current" />
                </motion.div>
              ) : (
                <motion.div
                  key="pause"
                  initial={{ scale: 0, rotate: 90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: -90 }}
                >
                  <Pause className="h-4 w-4 fill-current animate-pulse" />
                </motion.div>
              )
            ) : (
              <motion.div
                key="speaker"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 180 }}
              >
                <Volume2 className="h-4 w-4" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pulse animation when playing */}
          {isThisMessagePlaying && !isPaused && (
            <motion.div
              className="absolute inset-0 rounded-md bg-primary/20 -z-10"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.5, 0, 0.5]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          )}
        </Button>
      </motion.div>

      {/* Additional Controls (Stop & Settings) - Show when playing or hovered */}
      <AnimatePresence>
        {(isThisMessagePlaying || isHovered) && (
          <motion.div
            initial={{ opacity: 0, x: -10, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1"
          >
            {/* Stop Button */}
            {isThisMessagePlaying && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStop}
                className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive transition-all"
                title={t('chat.tts.stop', 'Stop')}
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Settings Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              className="h-7 w-7 hover:bg-muted/50 transition-all"
              title={t('chat.tts.settings', 'Settings')}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Bar */}
      <AnimatePresence>
        {isThisMessagePlaying && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="absolute -bottom-6 left-0 right-0 px-2"
          >
            <Progress value={progress} className="h-1" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fallback Language Badge */}
      <AnimatePresence>
        {isThisMessagePlaying && fallbackLanguage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 3 }}
            className="absolute -top-8 left-0 z-10"
          >
            <Badge variant="secondary" className="text-xs py-0.5 px-2 shadow-sm">
              {getFallbackLanguageName(fallbackLanguage)}
            </Badge>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <TTSSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentLanguage={language}
      />

      {/* Sentence Highlighting Overlay (renders in parent context) */}
      {isThisMessagePlaying && currentSentence >= 0 && (
        <style>
          {`
            [data-message-id="${messageId}"] [data-sentence="${currentSentence}"] {
              background-color: rgba(34, 197, 94, 0.15);
              border-radius: 0.25rem;
              padding: 0.125rem 0.25rem;
              margin: 0 -0.25rem;
              transition: all 0.3s ease-in-out;
            }
          `}
        </style>
      )}
    </div>
  );
}
