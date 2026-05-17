/**
 * Native Voice Button Component
 * Floating action button for native-first voice navigation
 * Shows real-time feedback: listening, processing, speaking states
 */

import React, { useState } from 'react';
import { Mic, MicOff, Loader2, Volume2, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useNativeVoiceNavigation } from '@/hooks/useNativeVoiceNavigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface NativeVoiceButtonProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showTranscript?: boolean;
  showExamples?: boolean;
}

export function NativeVoiceButton({
  className,
  size = 'md',
  showTranscript = true,
  showExamples = true,
}: NativeVoiceButtonProps) {
  const { t } = useTranslation();
  const {
    isListening,
    isProcessing,
    isSpeaking,
    partialTranscript,
    confidence,
    error,
    isSupported,
    provider,
    totalLatencyMs,
    lastIntent,
    toggleListening,
    stopListening,
    clearError,
    getExamples,
  } = useNativeVoiceNavigation();

  const [showPanel, setShowPanel] = useState(false);

  if (!isSupported) {
    return null;
  }

  const sizeClasses = {
    sm: 'h-10 w-10',
    md: 'h-14 w-14',
    lg: 'h-16 w-16',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-7 w-7',
  };

  const isActive = isListening || isProcessing || isSpeaking;

  const handleClick = async () => {
    if (isActive && !isProcessing && !isSpeaking) {
      await stopListening();
      setShowPanel(false);
    } else if (!isActive) {
      setShowPanel(true);
      await toggleListening();
    }
  };

  const examples = getExamples();

  return (
    <div data-tour="mic" className={cn('fixed z-50', className)}>
      {/* Expanded Panel */}
      <AnimatePresence>
        {showPanel && (isActive || partialTranscript) && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-20 right-0 w-72 bg-card border border-border rounded-2xl shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {isListening ? t('voice.listening', 'Listening...') : 
                   isProcessing ? t('voice.processing', 'Processing...') :
                   isSpeaking ? t('voice.speaking', 'Speaking...') :
                   t('voice.title', 'Voice Command')}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => { stopListening(); setShowPanel(false); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {/* Transcript */}
              {showTranscript && partialTranscript && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-sm text-foreground">"{partialTranscript}"</p>
                  {confidence > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {(confidence * 100).toFixed(0)}% confidence • {provider}
                    </p>
                  )}
                </div>
              )}

              {/* Last Intent Result */}
              {lastIntent && (
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm font-medium text-primary">
                      {lastIntent.announcement || lastIntent.intentId}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lastIntent.provider} • {totalLatencyMs.toFixed(0)}ms
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={clearError}
                  >
                    Dismiss
                  </Button>
                </div>
              )}

              {/* Examples */}
              {showExamples && !partialTranscript && !lastIntent && !error && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">
                    {t('voice.tryCommands', 'Try saying:')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {examples.map((example, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 text-xs bg-muted rounded-full text-muted-foreground"
                      >
                        "{example}"
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Status Bar */}
            <div className="px-4 py-2 bg-muted/30 border-t border-border">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{provider === 'native' ? '📱 Native' : '🌐 Web'}</span>
                <span>
                  {isListening ? '🎤 Recording' : 
                   isProcessing ? '⚡ Processing' : 
                   isSpeaking ? '🔊 Speaking' : 'Ready'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Button */}
      <motion.button
        onClick={handleClick}
        disabled={isProcessing}
        className={cn(
          'relative rounded-full flex items-center justify-center',
          'transition-all duration-200 shadow-lg',
          sizeClasses[size],
          isListening && 'bg-destructive text-destructive-foreground',
          isProcessing && 'bg-primary text-primary-foreground',
          isSpeaking && 'bg-secondary text-secondary-foreground',
          !isActive && 'bg-primary text-primary-foreground hover:bg-primary/90',
          'disabled:opacity-50'
        )}
        whileTap={{ scale: 0.95 }}
        aria-label={isListening ? 'Stop listening' : 'Start voice command'}
      >
        {/* Pulse Animation */}
        {isListening && (
          <>
            <motion.span
              className="absolute inset-0 rounded-full bg-destructive"
              animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <motion.span
              className="absolute inset-0 rounded-full bg-destructive"
              animate={{ scale: [1, 1.3], opacity: [0.3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
            />
          </>
        )}

        {/* Icon */}
        {isProcessing ? (
          <Loader2 className={cn(iconSizes[size], 'animate-spin')} />
        ) : isSpeaking ? (
          <Volume2 className={cn(iconSizes[size])} />
        ) : isListening ? (
          <MicOff className={cn(iconSizes[size])} />
        ) : (
          <Mic className={cn(iconSizes[size])} />
        )}
      </motion.button>

      {/* Quick Status Indicator */}
      {isActive && !showPanel && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive flex items-center justify-center"
        >
          <span className="text-xs text-destructive-foreground font-bold">●</span>
        </motion.div>
      )}
    </div>
  );
}

export default NativeVoiceButton;
