/**
 * VoiceContextualHints - Shows relevant voice commands based on current screen
 * Helps users discover what they can say
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface VoiceHint {
  command: string;
  description: string;
  example: string;
}

interface VoiceContextualHintsProps {
  currentRoute: string;
  language: string;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  className?: string;
}

const ROUTE_HINTS: Record<string, VoiceHint[]> = {
  '/app': [
    { command: 'Navigate', description: 'Go to any section', example: '"Show my lands"' },
    { command: 'Weather', description: 'Check weather', example: '"What\'s the weather?"' },
    { command: 'Help', description: 'Get help', example: '"Help me"' },
  ],
  '/app/lands': [
    { command: 'Add', description: 'Add new land', example: '"Add new land"' },
    { command: 'Edit', description: 'Edit land', example: '"Edit this land"' },
    { command: 'Delete', description: 'Delete land', example: '"Delete this land"' },
    { command: 'Navigate', description: 'Go back', example: '"Go back"' },
  ],
  '/app/schedule': [
    { command: 'Add', description: 'Add task', example: '"Add new task"' },
    { command: 'Delete', description: 'Delete task', example: '"Delete this task"' },
    { command: 'View', description: 'View details', example: '"Show details"' },
  ],
  '/app/weather': [
    { command: 'Query', description: 'Ask about weather', example: '"Will it rain today?"' },
    { command: 'Navigate', description: 'Go to lands', example: '"Show my lands"' },
  ],
  '/app/chat': [
    { command: 'Ask', description: 'Ask questions', example: '"How to grow wheat?"' },
    { command: 'Navigate', description: 'Go back', example: '"Go home"' },
  ],
};

const ROUTE_HINTS_HI: Record<string, VoiceHint[]> = {
  '/app': [
    { command: 'नेविगेट', description: 'किसी भी सेक्शन में जाएं', example: '"मेरी जमीन दिखाओ"' },
    { command: 'मौसम', description: 'मौसम देखें', example: '"मौसम कैसा है?"' },
    { command: 'मदद', description: 'मदद लें', example: '"मदद करो"' },
  ],
  '/app/lands': [
    { command: 'जोड़ें', description: 'नई जमीन जोड़ें', example: '"नई जमीन जोड़ो"' },
    { command: 'संपादित', description: 'जमीन बदलें', example: '"यह जमीन संपादित करो"' },
    { command: 'हटाएं', description: 'जमीन हटाएं', example: '"यह जमीन हटाओ"' },
    { command: 'नेविगेट', description: 'वापस जाएं', example: '"पीछे जाओ"' },
  ],
  '/app/schedule': [
    { command: 'जोड़ें', description: 'काम जोड़ें', example: '"नया काम जोड़ो"' },
    { command: 'हटाएं', description: 'काम हटाएं', example: '"यह काम हटाओ"' },
    { command: 'देखें', description: 'विवरण देखें', example: '"विवरण दिखाओ"' },
  ],
  '/app/weather': [
    { command: 'पूछें', description: 'मौसम के बारे में पूछें', example: '"क्या आज बारिश होगी?"' },
    { command: 'नेविगेट', description: 'जमीनों पर जाएं', example: '"मेरी जमीन दिखाओ"' },
  ],
  '/app/chat': [
    { command: 'पूछें', description: 'सवाल पूछें', example: '"गेहूं कैसे उगाएं?"' },
    { command: 'नेविगेट', description: 'वापस जाएं', example: '"घर जाओ"' },
  ],
};

export const VoiceContextualHints: React.FC<VoiceContextualHintsProps> = ({
  currentRoute,
  language,
  isMinimized: initialMinimized = false,
  onToggleMinimize,
  className,
}) => {
  const [isMinimized, setIsMinimized] = useState(initialMinimized);
  const [hints, setHints] = useState<VoiceHint[]>([]);

  useEffect(() => {
    const hintSets = language === 'hi' ? ROUTE_HINTS_HI : ROUTE_HINTS;
    
    // Find matching route or use default
    let matchedHints = hintSets[currentRoute];
    
    if (!matchedHints) {
      // Try partial match
      const routeKey = Object.keys(hintSets).find(key => currentRoute.startsWith(key));
      matchedHints = routeKey ? hintSets[routeKey] : hintSets['/app'];
    }

    setHints(matchedHints || []);
  }, [currentRoute, language]);

  const toggleMinimize = () => {
    const newState = !isMinimized;
    setIsMinimized(newState);
    onToggleMinimize?.();
  };

  if (hints.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        'fixed right-4 top-20 z-40',
        'max-w-sm w-full',
        className
      )}
    >
      <Card className="bg-background/95 backdrop-blur-md border shadow-xl">
        {/* Header */}
        <div
          className="flex items-center justify-between p-3 border-b cursor-pointer"
          onClick={toggleMinimize}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Mic className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                {language === 'hi' ? 'वॉइस कमांड' : 'Voice Commands'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {language === 'hi' ? 'यह कहें' : 'Try saying'}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              toggleMinimize();
            }}
          >
            {isMinimized ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Hints list */}
        <AnimatePresence>
          {!isMinimized && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
                {hints.map((hint, index) => (
                  <motion.div
                    key={hint.command}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-2 rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">
                            {index + 1}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium">
                            {hint.command}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {hint.description}
                          </span>
                        </div>
                        
                        <div className="mt-1 flex items-center gap-1">
                          <Mic className="w-3 h-3 text-muted-foreground" />
                          <code className="text-xs bg-muted px-2 py-0.5 rounded">
                            {hint.example}
                          </code>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Footer tip */}
              <div className="p-3 border-t bg-muted/30">
                <p className="text-xs text-muted-foreground text-center">
                  {language === 'hi' 
                    ? '💡 माइक बटन दबाएं और बोलना शुरू करें'
                    : '💡 Tap the mic button and start speaking'
                  }
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
};
