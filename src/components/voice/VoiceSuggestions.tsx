import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface VoiceSuggestionsProps {
  suggestions: string[];
  language: string;
  onSuggestionClick: (suggestion: string) => void;
  show: boolean;
}

export const VoiceSuggestions: React.FC<VoiceSuggestionsProps> = ({
  suggestions,
  language,
  onSuggestionClick,
  show,
}) => {
  if (!show || suggestions.length === 0) return null;

  const titles: Record<string, string> = {
    'hi': 'आप यह कह सकते हैं:',
    'en': 'You can say:',
    'ta': 'நீங்கள் இதைச் சொல்லலாம்:',
    'mr': 'तुम्ही हे म्हणू शकता:',
    'pa': 'ਤੁਸੀਂ ਇਹ ਕਹਿ ਸਕਦੇ ਹੋ:',
    'te': 'మీరు ఇలా చెప్పవచ్చు:',
    'bn': 'আপনি বলতে পারেন:',
    'gu': 'તમે આ કહી શકો છો:',
    'kn': 'ನೀವು ಹೇಳಬಹುದು:',
    'ml': 'നിങ്ങൾക്ക് പറയാം:',
    'or': 'ଆପଣ କହିପାରିବେ:',
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3 }}
        className="fixed bottom-24 left-4 right-4 z-50 max-w-md mx-auto"
      >
        <Card className="bg-gradient-to-br from-primary/10 via-background to-accent/10 backdrop-blur-lg border-2 border-primary/20 shadow-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-full bg-primary/20">
              <Lightbulb className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">
              {titles[language] || titles['en']}
            </h3>
          </div>

          <div className="space-y-2">
            {suggestions.map((suggestion, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 bg-background/80 hover:bg-primary/10 hover:border-primary transition-all group"
                  onClick={() => onSuggestionClick(suggestion)}
                >
                  <Mic className="w-4 h-4 text-primary group-hover:animate-pulse" />
                  <span className="text-sm">{suggestion}</span>
                </Button>
              </motion.div>
            ))}
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};
