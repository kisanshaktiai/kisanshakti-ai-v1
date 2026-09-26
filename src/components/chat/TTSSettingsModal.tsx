import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Volume2, RefreshCw, Check, Square } from 'lucide-react';
import { useTTSSettingsStore } from '@/stores/ttsSettingsStore';
import { useSpeech } from '@/hooks/useSpeech';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/use-toast';

interface TTSSettingsModalProps {
  open: boolean;
  onClose: () => void;
  currentLanguage: string;
  /** The message this modal was opened from; the preview reads its opening. */
  previewText?: string;
}

const DEFAULT_RATE = 1.0;
const PREVIEW_MAX_CHARS = 160;

/**
 * Chat speech settings. The speed saved here is the same farmer-wide rate the
 * Profile speech panel edits (ttsSettingsStore); useSpeech applies it to every
 * screen. The preview plays through the same engine and voice the farmer will
 * actually hear, reading the message the modal was opened from, so no
 * per-language sample sentence is needed.
 */
export function TTSSettingsModal({ open, onClose, currentLanguage, previewText }: TTSSettingsModalProps) {
  const { t } = useTranslation();
  const savedRate = useTTSSettingsStore((state) => state.rate);
  const setRate = useTTSSettingsStore((state) => state.setRate);

  const [localRate, setLocalRate] = useState(savedRate);
  const { speak, stop, isSpeaking, isLoading } = useSpeech({ language: currentLanguage, rate: localRate });

  React.useEffect(() => {
    if (open) setLocalRate(useTTSSettingsStore.getState().rate);
    else stop();
  }, [open, stop]);

  const handleSpeedChange = (value: number[]) => setLocalRate(value[0]);
  const handlePresetSpeed = (speed: number) => setLocalRate(speed);

  const playPreview = () => {
    if (isSpeaking || isLoading) {
      stop();
      return;
    }
    const text = (previewText || '').trim().slice(0, PREVIEW_MAX_CHARS);
    if (!text) return;
    void speak(text, currentLanguage);
  };

  const handleSave = () => {
    stop();
    setRate(localRate);
    toast({
      title: t('common.success'),
      description: t('chat.tts.settingsSaved', 'Text-to-speech settings saved'),
    });
    onClose();
  };

  const handleReset = () => {
    if (confirm(t('chat.tts.confirmReset', 'Reset all settings to default?'))) {
      setLocalRate(DEFAULT_RATE);
      toast({
        title: t('common.success'),
        description: t('chat.tts.settingsReset', 'Settings reset to default'),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            {t('chat.tts.settings', 'Text-to-Speech Settings')}
          </DialogTitle>
          <DialogDescription>
            {t('chat.tts.settingsDescription', 'Customize voice playback for your language')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Speed Control */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">
              {t('chat.tts.speed', 'Speech Speed')}
            </Label>

            {/* Preset Buttons */}
            <div className="flex gap-2">
              <Button
                variant={localRate === 0.75 ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetSpeed(0.75)}
                className="flex-1"
              >
                {t('chat.tts.slow', 'Slow')} (0.75×)
              </Button>
              <Button
                variant={localRate === 1.0 ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetSpeed(1.0)}
                className="flex-1"
              >
                {t('chat.tts.normal', 'Normal')} (1×)
              </Button>
              <Button
                variant={localRate === 1.25 ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetSpeed(1.25)}
                className="flex-1"
              >
                {t('chat.tts.fast', 'Fast')} (1.25×)
              </Button>
            </div>

            {/* Fine-tune Slider */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>0.5×</span>
                <span className="font-semibold">{localRate.toFixed(2)}×</span>
                <span>2.0×</span>
              </div>
              <Slider
                value={[localRate]}
                onValueChange={handleSpeedChange}
                min={0.5}
                max={2.0}
                step={0.05}
                className="w-full"
              />
            </div>

            {/* Preview at the chosen speed, through the real engine */}
            {previewText && (
              <Button
                variant="outline"
                size="sm"
                onClick={playPreview}
                className="w-full gap-2"
              >
                {isSpeaking || isLoading ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
                {isSpeaking || isLoading
                  ? t('chat.tts.stopPreview', 'Stop')
                  : t('chat.tts.preview', 'Preview')}
              </Button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleReset}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {t('common.reset', 'Reset')}
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Check className="h-4 w-4" />
            {t('common.save', 'Save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
