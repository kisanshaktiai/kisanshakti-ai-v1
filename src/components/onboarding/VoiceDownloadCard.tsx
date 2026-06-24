import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { voiceDownloadService } from '@/services/voiceDownloadService';
import { useTTSStore, PREINSTALLED_VOICES } from '@/stores/ttsStore';
import { toast } from '@/hooks/use-toast';

interface VoiceDownloadCardProps {
  language: string;
  languageName: string;
  onComplete?: () => void;
  onSkip?: () => void;
  autoStart?: boolean;
}

export function VoiceDownloadCard({
  language,
  languageName,
  onComplete,
  onSkip,
  autoStart = false
}: VoiceDownloadCardProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const isPreInstalled = voiceDownloadService.isPreInstalledVoice(`${language}-IN`);

  // Stable download handler with proper dependencies
  const handleDownload = React.useCallback(async () => {
    setStatus('downloading');
    setProgress(0);
    setErrorMessage('');

    try {
      // Check storage
      const storage = await voiceDownloadService.checkStorageAvailable();
      if (!storage.available) {
        setStatus('error');
        setErrorMessage(
          t('chat.tts.insufficientStorage', 'Not enough storage. Need ~80MB free. Current free space: {{space}}MB', {
            space: storage.freeSpace || 0
          })
        );
        return;
      }

      // Download with progress
      const success = await voiceDownloadService.downloadVoice(
        `${language}-IN`,
        (prog) => setProgress(prog)
      );

      if (success) {
        setStatus('success');
        toast({
          title: t('common.success'),
          description: t('chat.tts.voiceReady', '{{language}} voice ready!', { language: languageName })
        });
        setTimeout(() => {
          onComplete?.();
        }, 1500);
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      console.error('[Voice Download] Error:', error);
      setStatus('error');
      setErrorMessage(t('chat.tts.downloadFailed', 'Download failed. Please check your internet connection.'));
    }
  }, [language, languageName, onComplete, t]);

  // Effect with proper dependencies
  React.useEffect(() => {
    // Guard: only run if status is idle to prevent repeated execution
    if (autoStart && !isPreInstalled && status === 'idle') {
      handleDownload();
    } else if (isPreInstalled && status === 'idle') {
      setStatus('success');
      setTimeout(() => {
        onComplete?.();
      }, 1000);
    }
  }, [autoStart, isPreInstalled, status, handleDownload, onComplete]);

  const handleRetry = () => {
    handleDownload();
  };

  const handleUseFallback = () => {
    toast({
      title: t('common.info'),
      description: t('chat.tts.usingFallback', 'Using Hindi voice temporarily. You can download {{language}} later from settings.', {
        language: languageName
      })
    });
    onSkip?.();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        className="fixed bottom-4 right-4 left-4 md:left-auto md:w-96 z-50"
      >
        <Card className="border-2 shadow-2xl backdrop-blur-sm bg-card/95">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              {status === 'success' ? (
                <Check className="h-5 w-5 text-success" />
              ) : status === 'error' ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <Download className="h-5 w-5 text-primary animate-bounce" />
              )}
              {status === 'success'
                ? t('chat.tts.downloadComplete', 'Voice Ready!')
                : status === 'error'
                ? t('chat.tts.downloadError', 'Download Error')
                : t('chat.tts.downloadingVoice', 'Downloading Voice')}
            </CardTitle>
            <CardDescription>
              {status === 'success'
                ? t('chat.tts.voiceReadyDesc', '{{language}} voice is now available', { language: languageName })
                : status === 'error'
                ? errorMessage
                : t('chat.tts.downloadingDesc', 'Downloading {{language}} voice for text-to-speech ({{progress}}%)', {
                    language: languageName,
                    progress: Math.round(progress)
                  })}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Progress Bar */}
            {status === 'downloading' && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {t('chat.tts.estimatedTime', 'Estimated time: ~{{seconds}}s', {
                    seconds: Math.max(5, Math.round((100 - progress) / 3))
                  })}
                </p>
              </div>
            )}

            {/* Success Animation */}
            {status === 'success' && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex justify-center"
              >
                <div className="h-16 w-16 rounded-full bg-success/20 flex items-center justify-center">
                  <Check className="h-8 w-8 text-success" />
                </div>
              </motion.div>
            )}

            {/* Error Actions */}
            {status === 'error' && (
              <div className="flex gap-2">
                <Button onClick={handleRetry} className="flex-1 gap-2">
                  <RefreshCw className="h-4 w-4" />
                  {t('common.retry', 'Retry')}
                </Button>
                <Button onClick={handleUseFallback} variant="outline" className="flex-1">
                  {t('chat.tts.useHindi', 'Use Hindi')}
                </Button>
              </div>
            )}

            {/* Idle Actions */}
            {status === 'idle' && (
              <div className="flex gap-2">
                <Button onClick={handleDownload} className="flex-1 gap-2">
                  <Download className="h-4 w-4" />
                  {t('chat.tts.startDownload', 'Download Now')}
                </Button>
                <Button onClick={handleUseFallback} variant="outline" className="flex-1">
                  {t('common.skip', 'Skip')}
                </Button>
              </div>
            )}

            {/* Download in Background Notice */}
            {status === 'downloading' && (
              <p className="text-xs text-muted-foreground text-center">
                {t('chat.tts.continueUsingApp', 'You can continue using the app while downloading')}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
