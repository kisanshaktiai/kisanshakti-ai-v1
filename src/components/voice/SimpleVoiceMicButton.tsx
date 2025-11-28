import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface SimpleVoiceMicButtonProps {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  onStartListening: () => void;
  onStopListening: () => void;
  error?: string;
}

export const SimpleVoiceMicButton: React.FC<SimpleVoiceMicButtonProps> = ({
  isListening,
  isSpeaking,
  transcript,
  onStartListening,
  onStopListening,
  error,
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handlePressStart = () => {
    setIsPressed(true);
    onStartListening();
  };

  const handlePressEnd = () => {
    setIsPressed(false);
    // Small delay before stopping to ensure last words are captured
    timeoutRef.current = setTimeout(() => {
      onStopListening();
    }, 300);
  };

  const handlePressCancel = () => {
    setIsPressed(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onStopListening();
  };

  return (
    <div className="fixed bottom-24 left-0 right-0 z-50 flex flex-col items-center gap-4 px-4 pb-4">
      {/* Transcript Display */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <Card className="bg-background/95 backdrop-blur-sm border-primary/20 p-4">
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">
                  {isListening ? 'Listening...' : 'Processing...'}
                </span>
                <p className="text-base text-foreground">{transcript}</p>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full max-w-md"
          >
            <Card className="bg-destructive/10 border-destructive/20 p-3">
              <p className="text-sm text-destructive text-center">{error}</p>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Mic Button */}
      <div className="relative">
        {/* Pulse Animation */}
        <AnimatePresence>
          {(isListening || isPressed) && (
            <>
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [1, 1.5, 2], opacity: [0.5, 0.2, 0] }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeOut"
                }}
                className="absolute inset-0 -m-8 rounded-full bg-primary"
              />
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [1, 1.3, 1.6], opacity: [0.4, 0.2, 0] }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: 0.5
                }}
                className="absolute inset-0 -m-6 rounded-full bg-primary"
              />
            </>
          )}
        </AnimatePresence>

        {/* Button */}
        <motion.button
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
          onMouseLeave={handlePressCancel}
          onTouchStart={handlePressStart}
          onTouchEnd={handlePressEnd}
          onTouchCancel={handlePressCancel}
          disabled={isSpeaking}
          animate={{
            scale: isPressed ? 0.9 : 1,
          }}
          whileTap={{ scale: 0.85 }}
          className={cn(
            "relative h-20 w-20 rounded-full shadow-2xl transition-all",
            "flex items-center justify-center",
            "focus:outline-none focus:ring-4 focus:ring-primary/50",
            isPressed || isListening 
              ? "bg-primary" 
              : "bg-gradient-to-br from-primary to-primary/80",
            isSpeaking && "opacity-50 cursor-not-allowed"
          )}
          aria-label="Hold to speak"
        >
          <motion.div
            animate={{
              scale: isListening ? [1, 1.2, 1] : 1,
            }}
            transition={{
              duration: 1.5,
              repeat: isListening ? Infinity : 0,
              ease: "easeInOut",
            }}
          >
            {isSpeaking ? (
              <Loader2 className="h-10 w-10 text-primary-foreground animate-spin" />
            ) : (
              <Mic className="h-10 w-10 text-primary-foreground" />
            )}
          </motion.div>
        </motion.button>
      </div>

      {/* Instruction Text */}
      <AnimatePresence>
        {!isListening && !isSpeaking && !transcript && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-muted-foreground text-center"
          >
            Hold to speak
          </motion.p>
        )}
        {isListening && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-primary text-center font-medium"
          >
            Release to send
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};
