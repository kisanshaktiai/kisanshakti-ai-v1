import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Volume2, RefreshCw, Check } from 'lucide-react';
import { useTTSStore } from '@/stores/ttsStore';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TTSSettingsModalProps {
  open: boolean;
  onClose: () => void;
  currentLanguage: string;
}

export function TTSSettingsModal({ open, onClose, currentLanguage }: TTSSettingsModalProps) {
  const { t } = useTranslation();
  // Use stable selectors instead of full store
  const settings = useTTSStore(state => state.settings);
  const updateSettings = useTTSStore(state => state.updateSettings);
  
  const [localSettings, setLocalSettings] = useState(settings);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);

  // Load voices for current language - no store dependency
  React.useEffect(() => {
    if (open) {
      const voices = window.speechSynthesis?.getVoices() || [];
      const langPrefix = currentLanguage.split('-')[0];
      const filtered = voices.filter(v => v.lang.startsWith(langPrefix));
      setAvailableVoices(filtered);

      // Get current settings directly
      const currentSettings = useTTSStore.getState().settings;
      const current = currentSettings.selectedVoices[currentLanguage] || filtered[0]?.name || '';
      setSelectedVoice(current);
      
      // Sync local settings with store
      setLocalSettings(currentSettings);
    }
  }, [open, currentLanguage]);

  const handleSpeedChange = (value: number[]) => {
    setLocalSettings(prev => ({ ...prev, speed: value[0] }));
  };

  const handlePresetSpeed = (speed: number) => {
    setLocalSettings(prev => ({ ...prev, speed }));
  };

  const handleVoiceSelect = (voiceName: string) => {
    setSelectedVoice(voiceName);
  };

  const playVoicePreview = (voiceName: string) => {
    setPlayingPreview(voiceName);
    
    const voice = availableVoices.find(v => v.name === voiceName);
    if (!voice) return;

    const previewTexts: Record<string, string> = {
      'hi': 'यह आवाज़ का नमूना है। खेती के लिए उपयोगी सलाह।',
      'mr': 'हा आवाजाचा नमुना आहे। शेतीसाठी उपयुक्त सल्ला।',
      'en': 'This is a voice sample. Useful farming advice.',
      'ta': 'இது குரல் மாதிரி. விவசாயத்திற்கான பயனுள்ள ஆலோசனை.',
      'te': 'ఇది వాయిస్ నమూనా. వ్యవసాయానికి ఉపయోగకరమైన సలహా.',
      'kn': 'ಇದು ಧ್ವನಿ ಮಾದರಿ. ಕೃಷಿಗೆ ಉಪಯುಕ್ತ ಸಲಹೆ.',
      'pa': 'ਇਹ ਆਵਾਜ਼ ਦਾ ਨਮੂਨਾ ਹੈ। ਖੇਤੀ ਲਈ ਲਾਭਦਾਇਕ ਸਲਾਹ।',
      'gu': 'આ અવાજનો નમૂનો છે. ખેતી માટે ઉપયોગી સલાહ.',
      'bn': 'এটি ভয়েস নমুনা। কৃষির জন্য উপযোগী পরামর্শ।',
      'ml': 'ഇതൊരു ശബ്ദ മാതൃക. കൃഷിക്ക് ഉപകാരപ്രദമായ ഉപദേശം.'
    };

    const text = previewTexts[currentLanguage] || previewTexts['en'];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.rate = localSettings.speed;
    
    utterance.onend = () => setPlayingPreview(null);
    utterance.onerror = () => setPlayingPreview(null);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleSave = () => {
    const updatedSettings = {
      ...localSettings,
      selectedVoices: {
        ...localSettings.selectedVoices,
        [currentLanguage]: selectedVoice
      }
    };

    updateSettings(updatedSettings);
    
    toast({
      title: t('common.success'),
      description: t('chat.tts.settingsSaved', 'Text-to-speech settings saved'),
    });

    onClose();
  };

  const handleReset = () => {
    if (confirm(t('chat.tts.confirmReset', 'Reset all settings to default?'))) {
      const defaultSettings = {
        speed: 1.0,
        selectedVoices: {},
        autoRead: false,
        highlightFullMessage: false
      };
      setLocalSettings(defaultSettings);
      setSelectedVoice(availableVoices[0]?.name || '');
      
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
                variant={localSettings.speed === 0.75 ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetSpeed(0.75)}
                className="flex-1"
              >
                {t('chat.tts.slow', 'Slow')} (0.75×)
              </Button>
              <Button
                variant={localSettings.speed === 1.0 ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetSpeed(1.0)}
                className="flex-1"
              >
                {t('chat.tts.normal', 'Normal')} (1×)
              </Button>
              <Button
                variant={localSettings.speed === 1.25 ? "default" : "outline"}
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
                <span className="font-semibold">{localSettings.speed.toFixed(2)}×</span>
                <span>2.0×</span>
              </div>
              <Slider
                value={[localSettings.speed]}
                onValueChange={handleSpeedChange}
                min={0.5}
                max={2.0}
                step={0.05}
                className="w-full"
              />
            </div>
          </div>

          {/* Voice Selection */}
          {availableVoices.length > 1 && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">
                {t('chat.tts.voiceSelection', 'Voice')}
              </Label>
              <RadioGroup value={selectedVoice} onValueChange={handleVoiceSelect}>
                {availableVoices.map((voice) => (
                  <div
                    key={voice.name}
                    className="flex items-center justify-between space-x-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center space-x-2 flex-1">
                      <RadioGroupItem value={voice.name} id={voice.name} />
                      <Label htmlFor={voice.name} className="cursor-pointer flex-1">
                        <div className="font-medium">{voice.name}</div>
                        <div className="text-xs text-muted-foreground">{voice.lang}</div>
                      </Label>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => playVoicePreview(voice.name)}
                      disabled={playingPreview === voice.name}
                      className="shrink-0"
                    >
                      {playingPreview === voice.name ? (
                        <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Additional Options */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">
              {t('chat.tts.options', 'Options')}
            </Label>
            
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="space-y-0.5">
                <Label htmlFor="auto-read">{t('chat.tts.autoRead', 'Auto-read new messages')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('chat.tts.autoReadDesc', 'Automatically play new AI responses')}
                </p>
              </div>
              <Switch
                id="auto-read"
                checked={localSettings.autoRead}
                onCheckedChange={(checked) => 
                  setLocalSettings(prev => ({ ...prev, autoRead: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="space-y-0.5">
                <Label htmlFor="highlight-full">{t('chat.tts.highlightFull', 'Highlight full message')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('chat.tts.highlightFullDesc', 'Instead of sentence-by-sentence')}
                </p>
              </div>
              <Switch
                id="highlight-full"
                checked={localSettings.highlightFullMessage}
                onCheckedChange={(checked) => 
                  setLocalSettings(prev => ({ ...prev, highlightFullMessage: checked }))
                }
              />
            </div>
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
