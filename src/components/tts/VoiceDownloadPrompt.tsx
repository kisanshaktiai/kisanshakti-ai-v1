/**
 * Voice Download Prompt Component
 * Shows when enhanced voices are not available on device
 */

import { useState } from 'react';
import { X, Volume2, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';

interface VoiceDownloadPromptProps {
  onDismiss: () => void;
  instructions: { android: string; ios: string };
}

export function VoiceDownloadPrompt({ onDismiss, instructions }: VoiceDownloadPromptProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  
  const platform = Capacitor.getPlatform();
  const isAndroid = platform === 'android';
  const isIOS = platform === 'ios';
  
  const openSettings = () => {
    if (isAndroid) {
      // Open Android TTS settings
      try {
        (window as any).Android?.openTTSSettings?.();
      } catch (e) {
        // Fallback - show instructions
        setExpanded(true);
      }
    } else if (isIOS) {
      // iOS doesn't allow direct settings opening, show instructions
      setExpanded(true);
    } else {
      setExpanded(true);
    }
  };

  return (
    <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20 mb-4 animate-fade-in">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-primary/20">
            <Volume2 className="h-5 w-5 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-foreground mb-1">
              {t('tts.enhanceVoice', 'Enhance Voice Quality')}
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              {t('tts.downloadPrompt', 'Download high-quality voices for clearer, more natural speech')}
            </p>
            
            {expanded && (
              <div className="bg-background/50 rounded-lg p-3 mb-3 text-sm whitespace-pre-line">
                {isAndroid ? instructions.android : isIOS ? instructions.ios : instructions.android}
              </div>
            )}
            
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={openSettings}
                className="gap-1.5"
              >
                {expanded ? (
                  <>
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t('tts.openSettings', 'Open Settings')}
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    {t('tts.howToDownload', 'How to Download')}
                  </>
                )}
              </Button>
              
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismiss}
                className="text-muted-foreground"
              >
                {t('common.notNow', 'Not Now')}
              </Button>
            </div>
          </div>
          
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
