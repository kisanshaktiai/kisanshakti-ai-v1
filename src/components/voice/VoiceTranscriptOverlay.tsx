/**
 * VoiceTranscriptOverlay - Visual real-time transcript display
 * Shows what the user said and system responses
 */

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Bot, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface Message {
  id: string;
  role: 'user' | 'system';
  text: string;
  confidence?: number;
  success?: boolean;
  timestamp: number;
}

interface VoiceTranscriptOverlayProps {
  messages: Message[];
  currentTranscript?: string;
  isListening: boolean;
  position?: 'top' | 'bottom';
  maxMessages?: number;
  autoHideDelay?: number;
  className?: string;
}

export const VoiceTranscriptOverlay: React.FC<VoiceTranscriptOverlayProps> = ({
  messages,
  currentTranscript = '',
  isListening,
  position = 'top',
  maxMessages = 3,
  autoHideDelay = 3000,
  className,
}) => {
  const [visible, setVisible] = React.useState(true);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Show overlay when listening or new message
    if (isListening || messages.length > 0) {
      setVisible(true);
      
      // Clear existing timer
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }

      // Auto-hide after delay if not listening
      if (!isListening && autoHideDelay > 0) {
        hideTimerRef.current = setTimeout(() => {
          setVisible(false);
        }, autoHideDelay);
      }
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [isListening, messages, autoHideDelay]);

  useEffect(() => {
    // Scroll to latest message
    lastMessageRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!visible && !isListening) {
    return null;
  }

  const displayMessages = messages.slice(-maxMessages);

  return (
    <AnimatePresence>
      {(visible || isListening) && (
        <motion.div
          initial={{ opacity: 0, y: position === 'top' ? -20 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: position === 'top' ? -20 : 20 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'fixed left-1/2 -translate-x-1/2 z-40',
            position === 'top' ? 'top-4' : 'bottom-24',
            'max-w-md w-full px-4',
            className
          )}
        >
          <Card className="bg-background/95 backdrop-blur-md border shadow-2xl">
            <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
              {/* Previous messages */}
              {displayMessages.map((message, index) => (
                <motion.div
                  key={message.id}
                  ref={index === displayMessages.length - 1 ? lastMessageRef : null}
                  initial={{ opacity: 0, x: message.role === 'user' ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    'flex gap-3',
                    message.role === 'system' && 'flex-row-reverse'
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                      message.role === 'user' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-secondary text-secondary-foreground'
                    )}
                  >
                    {message.role === 'user' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>

                  {/* Message bubble */}
                  <div
                    className={cn(
                      'flex-1 rounded-lg p-3 text-sm',
                      message.role === 'user'
                        ? 'bg-primary/10 text-foreground'
                        : 'bg-secondary/50 text-foreground'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1">{message.text}</p>
                      
                      {message.success !== undefined && (
                        <div className="flex-shrink-0">
                          {message.success ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-destructive" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Confidence badge */}
                    {message.confidence !== undefined && message.role === 'user' && (
                      <div className="mt-2 flex items-center gap-1">
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${message.confidence * 100}%` }}
                            transition={{ duration: 0.3 }}
                            className={cn(
                              'h-full rounded-full',
                              message.confidence > 0.7 ? 'bg-green-500' :
                              message.confidence > 0.5 ? 'bg-yellow-500' :
                              'bg-destructive'
                            )}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(message.confidence * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Current transcript (live) */}
              <AnimatePresence>
                {isListening && currentTranscript && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex gap-3"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/50 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    
                    <div className="flex-1 rounded-lg p-3 bg-primary/5 border-2 border-primary/30 text-sm">
                      <p className="text-muted-foreground italic">{currentTranscript}</p>
                      
                      {/* Typing indicator */}
                      <div className="mt-2 flex gap-1">
                        {[...Array(3)].map((_, i) => (
                          <motion.div
                            key={i}
                            animate={{
                              scale: [1, 1.2, 1],
                              opacity: [0.5, 1, 0.5],
                            }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              delay: i * 0.2,
                            }}
                            className="w-1.5 h-1.5 rounded-full bg-primary"
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Listening indicator */}
              <AnimatePresence>
                {isListening && !currentTranscript && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center py-2"
                  >
                    <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                      <motion.span
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        🎤
                      </motion.span>
                      Listening...
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
