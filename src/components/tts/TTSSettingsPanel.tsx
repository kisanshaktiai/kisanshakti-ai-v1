/**
 * TTSSettingsPanel - TTS settings panel component
 * Includes enable, speed and volume controls
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Volume2, 
  Play, 
  RotateCcw, 
  Zap
} from 'lucide-react';
import { useTTSSettingsStore, TTS_LANGUAGES, TTSLanguageCode } from '@/stores/ttsSettingsStore';
import { useTTS } from '@/hooks/useTTS';
import { useLanguageStore } from '@/stores/languageStore';
import { IconTile, sectionCardClass } from '@/components/profile/SettingsList';
import { cn } from '@/lib/utils';

interface TTSSettingsPanelProps {
  className?: string;
  compact?: boolean;
}

export function TTSSettingsPanel({ className, compact = false }: TTSSettingsPanelProps) {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguageStore();
  const { speak, isSpeaking, isLoading } = useTTS();
  
  const {
    isEnabled,
    rate,
    volume,
    setEnabled,
    setRate,
    setVolume,
    resetToDefaults,
  } = useTTSSettingsStore();

  // Get current language name
  const langConfig = TTS_LANGUAGES[currentLanguage as TTSLanguageCode];
  const languageName = langConfig?.nativeName || langConfig?.name || currentLanguage;

  // The test sentence lives in the screen bundles (profile.tts.test_phrase),
  // so it follows the app language like every other text.
  const handleTestVoice = () => {
    speak(t('profile.tts.test_phrase'));
  };

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
    <div className={cn(sectionCardClass, className)}>
      <label htmlFor="tts-enabled" className="flex min-h-[64px] cursor-pointer items-center gap-3 px-4 py-3">
        <IconTile icon={Volume2} tone={isEnabled ? 'primary' : 'muted'} />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold leading-snug text-foreground">{t('profile.tts.title', 'Voice Settings')}</span>
          <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
            {t('profile.tts.language', 'Voice Language')}: {languageName}
          </span>
        </span>
        <Switch
          id="tts-enabled"
          checked={isEnabled}
          onCheckedChange={setEnabled}
          aria-label={t('profile.tts.toggle', 'Toggle voice')}
        />
      </label>

      {isEnabled && (
        <div className="space-y-5 border-t border-border px-4 pb-4 pt-4">
          {/* Speed Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {t('profile.tts.speed', 'Speed')}
              </Label>
              <Badge variant="outline" className="text-xs">{getSpeedLabel(rate)}</Badge>
            </div>
            <Slider
              value={[rate]}
              onValueChange={([v]) => setRate(v)}
              min={0.5}
              max={2}
              step={0.25}
              className="w-full py-3"
              aria-label={t('profile.tts.speed', 'Speed')}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t('profile.tts.slow', 'Slow')}</span>
              <span>{t('profile.tts.normal', 'Normal')}</span>
              <span>{t('profile.tts.fast', 'Fast')}</span>
            </div>
          </div>

          {/* Volume Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Volume2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {t('profile.tts.volume', 'Volume')}
              </Label>
              <Badge variant="outline" className="text-xs">{Math.round(volume * 100)}%</Badge>
            </div>
            <Slider
              value={[volume]}
              onValueChange={([v]) => setVolume(v)}
              min={0}
              max={1}
              step={0.1}
              className="w-full py-3"
              aria-label={t('profile.tts.volume', 'Volume')}
            />
          </div>

          {/* Test & Reset Buttons */}
          <div className="flex gap-3">
            <Button 
              variant="default"
              onClick={handleTestVoice}
              disabled={isSpeaking || isLoading}
              className="h-12 flex-1 text-base"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {isLoading ? t('profile.tts.loading', 'Loading...') : t('profile.tts.test', 'Test Voice')}
            </Button>
            <Button 
              variant="outline"
              size="icon"
              onClick={resetToDefaults}
              className="h-12 w-12 shrink-0"
              title={t('profile.tts.reset', 'Reset to defaults')}
              aria-label={t('profile.tts.reset', 'Reset to defaults')}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TTSSettingsPanel;
