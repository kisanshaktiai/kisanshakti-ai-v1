import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, VolumeX, Languages, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface VoiceHUDProps {
  isListening: boolean;
  isSpeaking: boolean;
  currentLanguage: string;
  transcript: string;
  confidence: number;
  examples: string[];
  onStartListening: () => void;
  onStopListening: () => void;
  onChangeLanguage: () => void;
  isOnline: boolean;
  error?: string;
}

export const VoiceHUD: React.FC<VoiceHUDProps> = ({
  isListening,
  isSpeaking,
  currentLanguage,
  transcript,
  confidence,
  examples,
  onStartListening,
  onStopListening,
  onChangeLanguage,
  isOnline,
  error,
}) => {
  const [showExamples, setShowExamples] = useState(false);

  useEffect(() => {
    // Show examples when not actively using voice
    if (!isListening && !isSpeaking && !transcript) {
      const timer = setTimeout(() => setShowExamples(true), 2000);
      return () => clearTimeout(timer);
    } else {
      setShowExamples(false);
    }
  }, [isListening, isSpeaking, transcript]);

  const languageNames: Record<string, string> = {
    'en': 'English',
    'hi': 'हिंदी',
    'mr': 'मराठी',
    'ta': 'தமிழ்',
    'pa': 'ਪੰਜਾਬੀ',
  };

  return (
    <div className="fixed bottom-24 left-0 right-0 z-50 flex flex-col items-center gap-4 px-4 pb-4">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full max-w-md"
          >
            <Card className="bg-destructive/10 border-destructive/20 p-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            </Card>
          </motion.div>
        )}

        {transcript && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <Card className="bg-background/95 backdrop-blur-sm border-primary/20 p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {isListening ? 'Listening...' : 'You said:'}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(confidence * 100)}% confident
                  </Badge>
                </div>
                <p className="text-base text-foreground">{transcript}</p>
              </div>
            </Card>
          </motion.div>
        )}

        {showExamples && !transcript && examples.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <Card className="bg-background/95 backdrop-blur-sm border-primary/20 p-4">
              <p className="text-sm text-muted-foreground mb-2">Try saying:</p>
              <div className="space-y-1">
                {examples.slice(0, 3).map((example, idx) => (
                  <p key={idx} className="text-sm text-foreground">
                    • "{example}"
                  </p>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main control button */}
      <div className="relative">
        <AnimatePresence>
          {isListening && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute inset-0 -m-4"
            >
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse" />
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          size="lg"
          onClick={isListening ? onStopListening : onStartListening}
          disabled={isSpeaking}
          className={cn(
            "relative h-16 w-16 rounded-full shadow-lg transition-all",
            isListening ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90",
            isSpeaking && "opacity-50 cursor-not-allowed"
          )}
          aria-label={isListening ? "Stop listening" : "Start listening"}
        >
          <motion.div
            animate={{
              scale: isListening ? [1, 1.1, 1] : 1,
              rotate: isSpeaking ? [0, 360] : 0,
            }}
            transition={{
              duration: isListening ? 1.5 : 2,
              repeat: (isListening || isSpeaking) ? Infinity : 0,
              ease: "easeInOut",
            }}
          >
            {isListening ? (
              <MicOff className="h-6 w-6" />
            ) : isSpeaking ? (
              <Volume2 className="h-6 w-6" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
          </motion.div>
        </Button>

        {/* Language and status badges */}
        <div className="absolute -top-2 -right-2 flex flex-col gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={onChangeLanguage}
            className="h-8 w-8 p-0 rounded-full shadow-sm"
            aria-label="Change language"
          >
            <Languages className="h-4 w-4" />
          </Button>
          
          <Badge
            variant={isOnline ? "default" : "secondary"}
            className="text-xs px-2 py-0.5"
          >
            {languageNames[currentLanguage] || currentLanguage}
          </Badge>

          {!isOnline && (
            <Badge variant="outline" className="text-xs px-2 py-0.5">
              Offline
            </Badge>
          )}
        </div>
      </div>

      {/* Status text */}
      <AnimatePresence>
        {(isListening || isSpeaking) && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-muted-foreground"
          >
            {isListening ? 'Tap to stop listening' : 'Assistant is speaking...'}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};
