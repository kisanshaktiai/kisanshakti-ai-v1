import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

interface LandVoiceCaptureProps {
  language: string; // BCP-47 e.g. "hi-IN", "mr-IN", "en-IN"
  onTranscript: (text: string) => void;
  className?: string;
}

const LANG_MAP: Record<string, string> = {
  en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', pa: 'pa-IN', ta: 'ta-IN',
  te: 'te-IN', kn: 'kn-IN', gu: 'gu-IN', bn: 'bn-IN',
};

export function LandVoiceCapture({ language, onTranscript, className }: LandVoiceCaptureProps) {
  const { t, i18n } = useTranslation();
  const [partial, setPartial] = useState('');
  const bcp47 = LANG_MAP[language] || LANG_MAP[i18n.language?.split('-')[0]] || 'en-IN';
  const finalRef = useRef('');

  const { isListening, isSupported, startListening, stopListening } = useSpeechRecognition({
    language: bcp47,
    onTranscript: (text) => {
      finalRef.current = text;
      setPartial('');
      if (text?.trim()) onTranscript(text.trim());
    },
    onPartial: (text) => setPartial(text),
  });

  // Hold-to-talk: pointerdown starts, pointerup stops.
  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSupported) return;
    finalRef.current = '';
    setPartial('');
    if (navigator.vibrate) navigator.vibrate(10);
    startListening();
  };
  const handleUp = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isListening) stopListening();
  };

  useEffect(() => () => { if (isListening) stopListening(); }, [isListening, stopListening]);

  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          'flex items-center justify-center gap-2 rounded-2xl px-4 py-3 bg-muted text-muted-foreground text-sm',
          className,
        )}
      >
        <MicOff className="h-4 w-4" />
        {t('lands.smartConfirm.voiceUnsupported', { defaultValue: 'Voice not supported' })}
      </button>
    );
  }

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <button
        type="button"
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={handleUp}
        className={cn(
          'flex items-center justify-center gap-2 rounded-full h-14 w-14',
          'transition-colors select-none touch-none',
          isListening
            ? 'bg-destructive text-destructive-foreground animate-pulse'
            : 'bg-primary text-primary-foreground',
        )}
        aria-label={t('lands.smartConfirm.holdToTalk', { defaultValue: 'Hold to talk' })}
      >
        {isListening ? <Loader2 className="h-6 w-6 animate-spin" /> : <Mic className="h-6 w-6" />}
      </button>
      <span className="text-[11px] text-muted-foreground">
        {isListening
          ? (partial || t('lands.smartConfirm.listening', { defaultValue: 'Listening…' }))
          : t('lands.smartConfirm.holdToTalk', { defaultValue: 'Hold to talk' })}
      </span>
    </div>
  );
}
