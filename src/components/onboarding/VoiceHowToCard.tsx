/**
 * VoiceHowToCard - First onboarding card explaining voice navigation
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, X, HandMetal, MessageSquare, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface VoiceHowToCardProps {
  onDismiss: () => void;
}

export const VoiceHowToCard: React.FC<VoiceHowToCardProps> = ({ onDismiss }) => {
  const { t } = useTranslation();
  const [showDemo, setShowDemo] = React.useState(false);

  const handleTryNow = () => {
    setShowDemo(true);
    
    // Track analytics
    if ((window as any).gtag) {
      (window as any).gtag('event', 'onboard_voice_tried', {
        event_category: 'onboarding',
        event_label: 'voice_how_to_card'
      });
    }

    // Auto-dismiss after demo
    setTimeout(() => {
      onDismiss();
    }, 3000);
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
                  <Mic className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Voice Navigation</CardTitle>
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
            {!showDemo ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Navigate hands-free with voice commands in your language
                </p>

                <div className="space-y-3">
                  {/* Step 1 */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <HandMetal className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Press & hold the mic button</p>
                      <p className="text-xs text-muted-foreground">Located at the bottom of the screen</p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Speak your command</p>
                      <p className="text-xs text-muted-foreground">E.g., "Go to weather" or "Open my lands"</p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Release to confirm</p>
                      <p className="text-xs text-muted-foreground">App navigates automatically</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleTryNow}
                    className="flex-1"
                    size="sm"
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    Try Voice Now
                  </Button>
                  <Button
                    onClick={onDismiss}
                    variant="outline"
                    size="sm"
                  >
                    Skip
                  </Button>
                </div>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <Mic className="w-8 h-8 text-primary" />
                  </motion.div>
                </div>
                <p className="text-sm font-medium mb-2">Great! Voice is ready</p>
                <p className="text-xs text-muted-foreground">
                  Look for the mic button to start using voice commands
                </p>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};
