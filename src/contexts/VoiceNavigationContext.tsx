import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguageStore } from '@/stores/languageStore';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useToast } from '@/hooks/use-toast';

interface VoiceNavigationContextType {
  isListening: boolean;
  isSpeaking: boolean;
  isEnabled: boolean;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  toggleVoiceNavigation: () => void;
  announceElement: (element: string) => void;
}

const VoiceNavigationContext = createContext<VoiceNavigationContextType | undefined>(undefined);

export const useVoiceNavigation = () => {
  const context = useContext(VoiceNavigationContext);
  if (!context) {
    throw new Error('useVoiceNavigation must be used within VoiceNavigationProvider');
  }
  return context;
};

const VOICE_COMMANDS: Record<string, { keywords: string[]; action: string; route?: string }> = {
  home: { keywords: ['home', 'घर', 'ਘਰ', 'मुख्य'], action: 'navigate', route: '/app' },
  lands: { keywords: ['land', 'जमीन', 'ਜ਼ਮੀਨ', 'खेत', 'farm'], action: 'navigate', route: '/lands' },
  weather: { keywords: ['weather', 'मौसम', 'ਮੌਸਮ'], action: 'navigate', route: '/weather' },
  schedule: { keywords: ['schedule', 'समय', 'ਸਮਾਂ', 'कार्यक्रम'], action: 'navigate', route: '/schedule' },
  chat: { keywords: ['chat', 'बात', 'ਗੱਲਬਾਤ', 'सहायक'], action: 'navigate', route: '/chat' },
  market: { keywords: ['market', 'बाजार', 'ਬਾਜ਼ਾਰ'], action: 'navigate', route: '/market' },
  profile: { keywords: ['profile', 'प्रोफ़ाइल', 'ਪ੍ਰੋਫਾਈਲ'], action: 'navigate', route: '/profile' },
  community: { keywords: ['community', 'समुदाय', 'ਕਮਿਊਨਿਟੀ'], action: 'navigate', route: '/social' },
  analytics: { keywords: ['analytics', 'विश्लेषण', 'ਵਿਸ਼ਲੇਸ਼ਣ'], action: 'navigate', route: '/analytics' },
};

export const VoiceNavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { currentLanguage } = useLanguageStore();
  const { toast } = useToast();
  const [isEnabled] = useState(true); // Always enabled for simplified UX

  const { speak, stop: stopSpeech, isSpeaking } = useTextToSpeech({
    language: currentLanguage,
  });

  const handleTranscript = useCallback((transcript: string) => {
    const normalizedTranscript = transcript.toLowerCase().trim();
    
    // Find matching command
    for (const [commandName, command] of Object.entries(VOICE_COMMANDS)) {
      const hasMatch = command.keywords.some(keyword => 
        normalizedTranscript.includes(keyword.toLowerCase())
      );

      if (hasMatch && command.route) {
        stopListening();
        speak(`Opening ${commandName}`);
        setTimeout(() => {
          navigate(command.route!);
        }, 500);
        toast({
          title: "Voice Command Executed",
          description: `Navigating to ${commandName}`,
        });
        return;
      }
    }

    // No command matched
    toast({
      title: "Command Not Recognized",
      description: "Please try again with a clear voice command",
      variant: "destructive",
    });
  }, [navigate, speak, toast]);

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

  useEffect(() => {
    if (!isSupported) {
      console.warn('Voice navigation not supported in this browser');
    }
  }, [isSupported]);

  const toggleVoiceNavigation = useCallback(() => {
    // Simplified - no toggle needed, always enabled
  }, []);

  const announceElement = useCallback((element: string) => {
    if (isEnabled) {
      speak(element);
    }
  }, [isEnabled, speak]);

  const value: VoiceNavigationContextType = {
    isListening,
    isSpeaking,
    isEnabled: true, // Always enabled
    startListening,
    stopListening,
    speak,
    stopSpeaking: stopSpeech,
    toggleVoiceNavigation,
    announceElement,
  };

  return (
    <VoiceNavigationContext.Provider value={value}>
      {children}
    </VoiceNavigationContext.Provider>
  );
};
