import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { VoiceService } from '@/services/voice/voiceService';
import { VoiceConfig, ASRResult, VoiceUtterance } from '@/services/voice/types';

interface ModernVoiceContextType {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  confidence: number;
  currentLanguage: string;
  isOnline: boolean;
  isSupported: boolean;
  examples: string[];
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string, ssml?: boolean) => Promise<void>;
  changeLanguage: (language: string) => void;
  showOnboarding: boolean;
  completeOnboarding: (config: Partial<VoiceConfig>) => void;
  skipOnboarding: () => void;
  setNavigationCallback: (callback: (route: string) => void) => void;
}

const ModernVoiceContext = createContext<ModernVoiceContextType | undefined>(undefined);

export const useModernVoice = () => {
  const context = useContext(ModernVoiceContext);
  if (!context) {
    throw new Error('useModernVoice must be used within ModernVoiceProvider');
  }
  return context;
};

export const ModernVoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [navigationCallback, setNavigationCallback] = useState<((route: string) => void) | null>(null);
  const { toast } = useToast();
  
  const [voiceService, setVoiceService] = useState<VoiceService | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check if onboarding was completed
  useEffect(() => {
    const completed = localStorage.getItem('voice_onboarding_completed');
    if (!completed) {
      setShowOnboarding(true);
    } else {
      initializeVoiceService();
    }
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const initializeVoiceService = useCallback((config?: Partial<VoiceConfig>) => {
    const savedConfig = localStorage.getItem('voice_config');
    const defaultConfig: VoiceConfig = {
      language: 'en',
      asrProvider: 'hybrid',
      ttsProvider: 'browser',
      privacyMode: 'local',
      telemetryEnabled: true,
      ...config,
      ...(savedConfig ? JSON.parse(savedConfig) : {}),
    };

    const service = new VoiceService(defaultConfig);
    setVoiceService(service);

    // Save config
    localStorage.setItem('voice_config', JSON.stringify(defaultConfig));
  }, []);

  const completeOnboarding = useCallback((config: Partial<VoiceConfig>) => {
    localStorage.setItem('voice_onboarding_completed', 'true');
    initializeVoiceService(config);
    setShowOnboarding(false);
    
    toast({
      title: "Voice Assistant Ready",
      description: "Start using voice commands to navigate the app!",
    });
  }, [initializeVoiceService, toast]);

  const skipOnboarding = useCallback(() => {
    localStorage.setItem('voice_onboarding_completed', 'true');
    initializeVoiceService();
    setShowOnboarding(false);
  }, [initializeVoiceService]);

  const handleASRResult = useCallback((result: ASRResult) => {
    setTranscript(result.transcript);
    setConfidence(result.confidence);

    if (result.isFinal && voiceService) {
      const intentMatcher = voiceService.getIntentMatcher();
      const utterance = intentMatcher.matchIntent(result.transcript, !isOnline);

      if (utterance) {
        handleIntent(utterance);
      } else {
        setError('Command not recognized. Try again or say "help" for examples.');
        setTimeout(() => setError(null), 3000);
      }
    }
  }, [voiceService, isOnline]);

  const handleIntent = useCallback((utterance: VoiceUtterance) => {
    const intentMatcher = voiceService?.getIntentMatcher();
    if (!intentMatcher) return;

    const intent = intentMatcher.getIntent(utterance.intent);
    if (!intent) return;

    // Execute intent action
    if (intent.action === 'navigate' && intent.route) {
      voiceService?.speak({ text: `Opening ${intent.id.split('.')[1]}`, language: utterance.language })
        .then(() => {
          if (navigationCallback) {
            navigationCallback(intent.route!);
          }
          setTranscript('');
        });
    } else if (intent.action === 'query') {
      // Handle query intents
      toast({
        title: "Query Received",
        description: `Processing: ${utterance.text}`,
      });
    }
  }, [voiceService, navigationCallback, toast]);

  const startListening = useCallback(() => {
    if (!voiceService || !voiceService.isSupported()) {
      toast({
        title: "Not Supported",
        description: "Voice recognition is not supported on this device.",
        variant: "destructive",
      });
      return;
    }

    setError(null);
    setIsListening(true);
    
    voiceService.startListening(
      handleASRResult,
      () => setIsListening(false)
    );
  }, [voiceService, handleASRResult, toast]);

  const stopListening = useCallback(() => {
    voiceService?.stopListening();
    setIsListening(false);
    setTranscript('');
  }, [voiceService]);

  const speak = useCallback(async (text: string, ssml: boolean = false) => {
    if (!voiceService) return;

    setIsSpeaking(true);
    try {
      await voiceService.speak({
        text,
        language: voiceService.getConfig().language,
        ssml,
      });
    } catch (error) {
      console.error('TTS error:', error);
    } finally {
      setIsSpeaking(false);
    }
  }, [voiceService]);

  const changeLanguage = useCallback((language: string) => {
    voiceService?.changeLanguage(language);
    toast({
      title: "Language Changed",
      description: `Voice commands now in ${language}`,
    });
  }, [voiceService, toast]);

  const examples = voiceService?.getIntentMatcher().getExamples() || [];
  const currentLanguage = voiceService?.getConfig().language || 'en';
  const isSupported = voiceService?.isSupported() || false;

  return (
    <ModernVoiceContext.Provider
      value={{
        isListening,
        isSpeaking,
        transcript,
        confidence,
        currentLanguage,
        isOnline,
        isSupported,
        examples,
        error,
        startListening,
        stopListening,
        speak,
        changeLanguage,
        showOnboarding,
        completeOnboarding,
        skipOnboarding,
        setNavigationCallback: (callback: (route: string) => void) => setNavigationCallback(() => callback),
      }}
    >
      {children}
    </ModernVoiceContext.Provider>
  );
};
