import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, VolumeX, Sparkles } from 'lucide-react';
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
      stopListening();
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    } else {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setStream(mediaStream);
        startListening();
      } catch (error) {
        console.error('Failed to access microphone:', error);
      }
    }
  };

  return (
    <>
      {/* Waveform Visualizer */}
      <AnimatePresence>
        {isListening && <WaveformVisualizer isListening={isListening} stream={stream} />}
      </AnimatePresence>

      {/* Voice Assistant Floating Button - Left side for rural farmer accessibility */}
      <motion.div
        className="fixed bottom-24 left-6 z-50 flex flex-col gap-3"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {/* Toggle Voice Navigation */}
        <motion.div
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button
            onClick={toggleVoiceNavigation}
            size="icon"
            variant={isEnabled ? "default" : "secondary"}
            className={`h-12 w-12 rounded-full shadow-lg ${
              isEnabled 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted text-muted-foreground'
            }`}
            aria-label={isEnabled ? "Disable voice navigation" : "Enable voice navigation"}
          >
            {isEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </Button>
        </motion.div>

        {/* Main Voice Button */}
        {isEnabled && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button
              onClick={handleVoiceClick}
              size="icon"
              className={`h-16 w-16 rounded-full shadow-2xl relative ${
                isListening
                  ? 'bg-destructive text-destructive-foreground animate-pulse'
                  : isSpeaking
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-primary text-primary-foreground'
              }`}
              aria-label={isListening ? "Stop listening" : "Start voice command"}
            >
              {/* Pulse animation when listening */}
              {isListening && (
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
              {isSpeaking && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-accent opacity-40"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              )}

              {/* Icon */}
              <div className="relative z-10">
                {isListening ? (
                  <MicOff className="h-7 w-7" />
                ) : isSpeaking ? (
                  <Sparkles className="h-7 w-7 animate-spin" />
                ) : (
                  <Mic className="h-7 w-7" />
                )}
              </div>
            </Button>
          </motion.div>
        )}

        {/* Help Text - Flipped to right side */}
        {isEnabled && !isListening && !isSpeaking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute left-20 bottom-4 bg-popover text-popover-foreground px-4 py-2 rounded-lg shadow-lg text-sm whitespace-nowrap"
          >
            Tap to speak
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-popover" />
          </motion.div>
        )}

        {/* Listening indicator - Flipped to right side */}
        {isListening && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute left-20 bottom-4 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg text-sm font-semibold whitespace-nowrap"
          >
            Listening...
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-destructive" />
          </motion.div>
        )}
      </motion.div>
    </>
  );
};
