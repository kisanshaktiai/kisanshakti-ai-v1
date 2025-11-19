import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useVoiceNavigation } from '@/contexts/VoiceNavigationContext';
import { useLanguageStore } from '@/stores/languageStore';
import { cn } from '@/lib/utils';

interface VoiceInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  voiceLabel: string;
  onVoiceStart?: () => void;
  onVoiceEnd?: () => void;
}

export const VoiceInput = React.forwardRef<HTMLInputElement, VoiceInputProps>(
  ({ value, onChange, voiceLabel, onVoiceStart, onVoiceEnd, className, ...props }, ref) => {
    const [isVoiceActive, setIsVoiceActive] = useState(false);
    const { currentLanguage } = useLanguageStore();
    const { isEnabled: voiceNavEnabled } = useVoiceNavigation();
    const inputRef = useRef<HTMLInputElement>(null);

    const handleTranscript = (transcript: string) => {
      onChange(transcript);
      setIsVoiceActive(false);
      onVoiceEnd?.();
    };

    const {
      isListening,
      startListening,
      stopListening,
      isSupported,
    } = useSpeechRecognition({
      onTranscript: handleTranscript,
      language: currentLanguage === 'hi' ? 'hi-IN' : 
                currentLanguage === 'pa' ? 'pa-IN' :
                currentLanguage === 'mr' ? 'mr-IN' :
                currentLanguage === 'ta' ? 'ta-IN' : 'en-IN',
    });

    const handleVoiceToggle = () => {
      if (isListening) {
        stopListening();
        setIsVoiceActive(false);
        onVoiceEnd?.();
      } else {
        startListening();
        setIsVoiceActive(true);
        onVoiceStart?.();
      }
    };

    useEffect(() => {
      if (isListening) {
        inputRef.current?.focus();
      }
    }, [isListening]);

    const showVoiceButton = voiceNavEnabled && isSupported;

    return (
      <div className="relative w-full">
        <Input
          ref={ref || inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            showVoiceButton && 'pr-12',
            isVoiceActive && 'ring-2 ring-primary',
            className
          )}
          aria-label={voiceLabel}
          {...props}
        />
        
        {showVoiceButton && (
          <Button
            type="button"
            onClick={handleVoiceToggle}
            size="icon"
            variant="ghost"
            className={cn(
              'absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8',
              isListening && 'text-destructive animate-pulse'
            )}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
          >
            {isListening ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        )}

        {isListening && (
          <div className="absolute -bottom-6 left-0 text-xs text-muted-foreground animate-pulse">
            Listening... Speak now
          </div>
        )}
      </div>
    );
  }
);

VoiceInput.displayName = 'VoiceInput';
