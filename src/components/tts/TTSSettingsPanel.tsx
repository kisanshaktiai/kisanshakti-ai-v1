/**
 * TTSSettingsPanel - TTS settings panel component
 * Includes speed, volume, and auto-read toggles
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Volume2, 
  Play, 
  RotateCcw, 
  Zap,
  MessageSquare,
  Bell,
  Calendar
} from 'lucide-react';
import { useTTSSettingsStore, TTS_LANGUAGES, TTSLanguageCode } from '@/stores/ttsSettingsStore';
import { useTTS } from '@/hooks/useTTS';
import { useLanguageStore } from '@/stores/languageStore';
import { cn } from '@/lib/utils';

interface TTSSettingsPanelProps {
  className?: string;
  compact?: boolean;
}

export function TTSSettingsPanel({ className, compact = false }: TTSSettingsPanelProps) {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguageStore();
  const { speak, isSpeaking, isLoading, lastProvider, latency } = useTTS();
  
  const {
    isEnabled,
    rate,
    volume,
    autoReadChat,
    autoReadAlerts,
    autoReadSchedule,
    setEnabled,
    setRate,
    setVolume,
    setAutoReadChat,
    setAutoReadAlerts,
    setAutoReadSchedule,
    resetToDefaults,
  } = useTTSSettingsStore();

  // Get current language name
  const langConfig = TTS_LANGUAGES[currentLanguage as TTSLanguageCode];
  const languageName = langConfig?.nativeName || langConfig?.name || currentLanguage;

  // Test phrases for each language
  const testPhrases: Record<string, string> = {
    en: 'Hello! Text-to-speech is working perfectly.',
    hi: 'नमस्ते! टेक्स्ट टू स्पीच सही काम कर रहा है।',
    mr: 'नमस्कार! टेक्स्ट टू स्पीच योग्यरित्या कार्य करत आहे।',
    pa: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਟੈਕਸਟ ਟੂ ਸਪੀਚ ਸਹੀ ਕੰਮ ਕਰ ਰਿਹਾ ਹੈ।',
    ta: 'வணக்கம்! உரையிலிருந்து பேச்சு சரியாக வேலை செய்கிறது.',
  };

  const handleTestVoice = () => {
    const phrase = testPhrases[currentLanguage] || testPhrases.en;
    speak(phrase);
  };

  const speedLabels = ['0.5x', '0.75x', '1x', '1.25x', '1.5x', '2x'];
  const getSpeedLabel = (value: number): string => {
    if (value <= 0.5) return '0.5x';
    if (value <= 0.75) return '0.75x';
    if (value <= 1.0) return '1x';
    if (value <= 1.25) return '1.25x';
    if (value <= 1.5) return '1.5x';
    return '2x';
  };

  if (compact) {
    return (
      <div className={cn('space-y-4', className)}>
        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <Label>{t('profile.tts.enable', 'Voice Readout')}</Label>
          </div>
          <Switch checked={isEnabled} onCheckedChange={setEnabled} />
        </div>

        {isEnabled && (
          <>
            {/* Speed Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('profile.tts.speed', 'Speed')}</Label>
                <Badge variant="secondary" className="text-xs">{getSpeedLabel(rate)}</Badge>
              </div>
              <Slider
                value={[rate]}
                onValueChange={([v]) => setRate(v)}
                min={0.5}
                max={2}
                step={0.25}
                className="w-full"
              />
            </div>

            {/* Test Button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleTestVoice}
              disabled={isSpeaking || isLoading}
              className="w-full"
            >
              <Play className="h-3 w-3 mr-2" />
              {isLoading ? t('profile.tts.loading', 'Loading...') : t('profile.tts.test', 'Test Voice')}
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <Card className={cn('border-0 shadow-lg', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('profile.tts.title', 'Voice Settings')}</CardTitle>
              <CardDescription className="text-xs">
                {t('profile.tts.description', 'Configure text-to-speech settings')}
              </CardDescription>
            </div>
          </div>
          <Switch 
            checked={isEnabled} 
            onCheckedChange={setEnabled}
            aria-label={t('profile.tts.toggle', 'Toggle voice')}
          />
        </div>
      </CardHeader>

      {isEnabled && (
        <CardContent className="space-y-6">
          {/* Current Language */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">{t('profile.tts.language', 'Voice Language')}</span>
            <Badge variant="secondary">{languageName}</Badge>
          </div>

          {/* Speed Control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                {t('profile.tts.speed', 'Speed')}
              </Label>
              <Badge variant="outline">{getSpeedLabel(rate)}</Badge>
            </div>
            <Slider
              value={[rate]}
              onValueChange={([v]) => setRate(v)}
              min={0.5}
              max={2}
              step={0.25}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground px-1">
              <span>Slow</span>
              <span>Normal</span>
              <span>Fast</span>
            </div>
          </div>

          {/* Volume Control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                {t('profile.tts.volume', 'Volume')}
              </Label>
              <Badge variant="outline">{Math.round(volume * 100)}%</Badge>
            </div>
            <Slider
              value={[volume]}
              onValueChange={([v]) => setVolume(v)}
              min={0}
              max={1}
              step={0.1}
              className="w-full"
            />
          </div>

          {/* Auto-Read Toggles */}
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-sm font-medium">{t('profile.tts.autoRead', 'Auto Read')}</Label>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('profile.tts.autoReadChat', 'AI Chat Responses')}</span>
                </div>
                <Switch checked={autoReadChat} onCheckedChange={setAutoReadChat} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('profile.tts.autoReadAlerts', 'Weather & Alerts')}</span>
                </div>
                <Switch checked={autoReadAlerts} onCheckedChange={setAutoReadAlerts} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('profile.tts.autoReadSchedule', 'Daily Tasks')}</span>
                </div>
                <Switch checked={autoReadSchedule} onCheckedChange={setAutoReadSchedule} />
              </div>
            </div>
          </div>

          {/* Test & Reset Buttons */}
          <div className="flex gap-2 pt-2">
            <Button 
              variant="default"
              onClick={handleTestVoice}
              disabled={isSpeaking || isLoading}
              className="flex-1"
            >
              <Play className="h-4 w-4 mr-2" />
              {isLoading ? t('profile.tts.loading', 'Loading...') : t('profile.tts.test', 'Test Voice')}
            </Button>
            <Button 
              variant="outline"
              onClick={resetToDefaults}
              title={t('profile.tts.reset', 'Reset to defaults')}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* Performance Info */}
          {lastProvider && (
            <div className="flex items-center justify-between text-xs text-muted-foreground p-2 bg-muted/30 rounded">
              <span>Provider: {lastProvider}</span>
              {latency && <span>Latency: {latency}ms</span>}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default TTSSettingsPanel;
