import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVoiceNavigation } from '@/contexts/VoiceNavigationContext';
import { WaveformVisualizer } from '@/components/chat/WaveformVisualizer';

export const VoiceAssistant: React.FC = () => {
  const {
    isListening,
    isSpeaking,
    isEnabled,
    startListening,
    stopListening,
    toggleVoiceNavigation,
  } = useVoiceNavigation();

  const [stream, setStream] = useState<MediaStream | null>(null);

  const handleVoiceClick = async () => {
    if (isListening) {
      // Stop listening
      stopListening();
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    } else {
      // Start listening
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setStream(mediaStream);
        startListening();
      } catch (error) {
        console.error('Failed to access microphone:', error);
      }
    }
  };

  // Get button state
  const getButtonState = () => {
    if (isListening) return 'listening';
    if (isSpeaking) return 'speaking';
    return 'ready';
  };

  const buttonState = getButtonState();

  return (
    <>
      {/* Waveform Visualizer */}
      <AnimatePresence>
        {isListening && <WaveformVisualizer isListening={isListening} stream={stream} />}
      </AnimatePresence>

      {/* Single Voice Assistant Button - Left side for rural farmer accessibility */}
      <motion.div
        className="fixed bottom-24 left-6 z-50"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <motion.div
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button
            onClick={handleVoiceClick}
            size="icon"
            className={`h-16 w-16 rounded-full shadow-2xl relative transition-all ${
              buttonState === 'listening'
                ? 'bg-destructive text-destructive-foreground animate-pulse'
                : buttonState === 'speaking'
                ? 'bg-accent text-accent-foreground'
                : 'bg-primary text-primary-foreground'
            }`}
            aria-label={
              buttonState === 'listening' 
                ? "Stop listening" 
                : "Start voice command"
            }
          >
            {/* Pulse animation when listening */}
            {buttonState === 'listening' && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-full bg-destructive opacity-30"
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full bg-destructive opacity-20"
                  animate={{ scale: [1, 2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                />
              </>
            )}

            {/* Speaking animation */}
            {buttonState === 'speaking' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-accent opacity-40"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            )}

            {/* Icon */}
            <div className="relative z-10">
              {buttonState === 'listening' ? (
                <MicOff className="h-7 w-7" />
              ) : buttonState === 'speaking' ? (
                <Sparkles className="h-7 w-7 animate-spin" />
              ) : (
                <Mic className="h-7 w-7" />
              )}
            </div>
          </Button>
        </motion.div>

        {/* Help Text - Positioned to the right */}
        {!isListening && !isSpeaking && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="absolute left-20 bottom-4 bg-popover text-popover-foreground px-4 py-2 rounded-lg shadow-lg text-sm whitespace-nowrap"
          >
            Tap to speak
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-popover" />
          </motion.div>
        )}

        {/* Listening indicator - Positioned to the right */}
        {isListening && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="absolute left-20 bottom-4 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg text-sm font-semibold whitespace-nowrap"
          >
            Listening... (tap to stop)
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-destructive" />
          </motion.div>
        )}
      </motion.div>
    </>
  );
};
