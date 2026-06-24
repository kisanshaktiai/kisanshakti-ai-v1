/**
 * TTS Voice Settings Component
 * Allows users to adjust rate, pitch, and volume
 */

import { useState } from 'react';
import { Volume2, Gauge, Music2, VolumeX, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { VoicePreferences } from '@/services/enhancedNativeTTSService';

interface TTSVoiceSettingsProps {
  preferences: VoicePreferences;
  onChange: (prefs: Partial<VoicePreferences>) => void;
  onTestVoice?: () => void;
  language?: string;
}

const DEFAULT_PREFS: VoicePreferences = {
  rate: 0.9,
  pitch: 1.0,
  volume: 0.9
};

export function TTSVoiceSettings({ 
  preferences, 
  onChange, 
  onTestVoice,
  language = 'hi'
}: TTSVoiceSettingsProps) {
  const { t } = useTranslation();
  const [isTesting, setIsTesting] = useState(false);

  const handleReset = () => {
    onChange(DEFAULT_PREFS);
  };

  const handleTest = async () => {
    setIsTesting(true);
    onTestVoice?.();
    setTimeout(() => setIsTesting(false), 2000);
  };

  const formatValue = (value: number, isRate = false): string => {
    if (isRate) {
      if (value < 0.8) return t('tts.slow', 'Slow');
      if (value > 1.2) return t('tts.fast', 'Fast');
      return t('tts.normal', 'Normal');
    }
    return `${Math.round(value * 100)}%`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Volume2 className="h-4 w-4" />
          {t('tts.voiceSettings', 'Voice Settings')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Speech Rate */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-sm">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              {t('tts.speechRate', 'Speech Rate')}
            </Label>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {formatValue(preferences.rate, true)}
            </span>
          </div>
          <Slider
            value={[preferences.rate]}
            onValueChange={([value]) => onChange({ rate: value })}
            min={0.5}
            max={1.5}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('tts.slower', 'Slower')}</span>
            <span>{t('tts.faster', 'Faster')}</span>
          </div>
        </div>

        {/* Pitch */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-sm">
              <Music2 className="h-4 w-4 text-muted-foreground" />
              {t('tts.pitch', 'Pitch')}
            </Label>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {formatValue(preferences.pitch)}
            </span>
          </div>
          <Slider
            value={[preferences.pitch]}
            onValueChange={([value]) => onChange({ pitch: value })}
            min={0.5}
            max={1.5}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('tts.lower', 'Lower')}</span>
            <span>{t('tts.higher', 'Higher')}</span>
          </div>
        </div>

        {/* Volume */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-sm">
              <VolumeX className="h-4 w-4 text-muted-foreground" />
              {t('tts.volume', 'Volume')}
            </Label>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {formatValue(preferences.volume)}
            </span>
          </div>
          <Slider
            value={[preferences.volume]}
            onValueChange={([value]) => onChange({ volume: value })}
            min={0.1}
            max={1.0}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('tts.quieter', 'Quieter')}</span>
            <span>{t('tts.louder', 'Louder')}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="flex-1 gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('tts.resetDefaults', 'Reset')}
          </Button>
          
          {onTestVoice && (
            <Button
              variant="default"
              size="sm"
              onClick={handleTest}
              disabled={isTesting}
              className="flex-1 gap-1.5"
            >
              <Play className="h-3.5 w-3.5" />
              {isTesting ? t('tts.playing', 'Playing...') : t('tts.testVoice', 'Test Voice')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
