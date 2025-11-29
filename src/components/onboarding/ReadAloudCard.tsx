/**
 * ReadAloudCard - Second onboarding card for TTS/Read Aloud feature
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Volume2, X, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';

interface ReadAloudCardProps {
  onDismiss: () => void;
}

export const ReadAloudCard: React.FC<ReadAloudCardProps> = ({ onDismiss }) => {
  const { t, i18n } = useTranslation();
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const { speak, stop, isSpeaking } = useTextToSpeech();

  const handleToggle = (enabled: boolean) => {
    setTtsEnabled(enabled);
    localStorage.setItem('tts_enabled', enabled ? 'true' : 'false');

    if (enabled) {
      // Play sample
      handlePlaySample();
    } else {
      stop();
    }
  };

  const handlePlaySample = () => {
    const sampleText = getSampleText(i18n.language);
    speak(sampleText);
  };

  const getSampleText = (lang: string) => {
    const samples: Record<string, string> = {
      hi: 'नमस्ते। मैं आपका कृषि सहायक हूं। मैं आपके सवालों का जवाब दे सकता हूं।',
      en: 'Hello. I am your agricultural assistant. I can answer your questions.',
      pa: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ। ਮੈਂ ਤੁਹਾਡਾ ਖੇਤੀ ਸਹਾਇਕ ਹਾਂ।',
      mr: 'नमस्कार। मी तुमचा शेती सहाय्यक आहे।',
      ta: 'வணக்கம். நான் உங்கள் விவசாய உதவியாளர்.',
      default: 'Hello. I am your agricultural assistant.'
    };
    return samples[lang] || samples.default;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -50, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:bottom-4 md:w-96"
      >
        <Card className="border-primary/20 shadow-2xl bg-card/95 backdrop-blur-xl">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Volume2 className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Read Aloud</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDismiss}
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enable text-to-speech to hear AI responses read aloud in your language
            </p>

            {/* TTS Toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <p className="text-sm font-medium">Voice Feedback</p>
                <p className="text-xs text-muted-foreground">Hear responses aloud</p>
              </div>
              <Switch
                checked={ttsEnabled}
                onCheckedChange={handleToggle}
              />
            </div>

            {/* Sample Player */}
            {ttsEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-2"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePlaySample}
                  disabled={isSpeaking}
                  className="w-full"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {isSpeaking ? 'Playing...' : 'Play Sample'}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  You can change this anytime in Settings
                </p>
              </motion.div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={onDismiss}
                className="flex-1"
                size="sm"
              >
                Got It
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};
