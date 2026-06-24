import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { VoiceService } from '@/services/voice/voiceService';
import { VoiceConfig, ASRResult, VoiceUtterance } from '@/services/voice/types';
import { useTenant } from '@/hooks/useTenant';
import { useAuthStore } from '@/stores/authStore';
import { getVoicePlatformInfo, getUnsupportedMessage } from '@/services/voice/voicePlatformDetector';

interface ModernVoiceContextType {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  confidence: number;
  currentLanguage: string;
  isOnline: boolean;
  isSupported: boolean;
  isReady: boolean;
  examples: string[];
  error: string | null;
  isVoiceModeActive: boolean;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string, ssml?: boolean) => Promise<void>;
  changeLanguage: (language: string) => void;
  showVoiceMode: () => void;
  hideVoiceMode: () => void;
  showOnboarding: boolean;
  completeOnboarding: (config: Partial<VoiceConfig>) => void;
  skipOnboarding: () => void;
  setNavigationCallback: (callback: (route: string) => void) => void;
  getDialogManager: () => any; // Access to dialog manager
  getSlotExtractor: () => any; // Access to slot extractor
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
  const { tenant } = useTenant();
  const { user } = useAuthStore();
  
  const [voiceService, setVoiceService] = useState<VoiceService | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);

  const initializeVoiceService = useCallback((config?: Partial<VoiceConfig>) => {
    console.log('[Voice] Initializing voice service with tenant:', tenant?.id);
    
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

    const service = new VoiceService(defaultConfig, tenant?.id || '');
    console.log('[Voice] Service initialized. Supported:', service.isSupported());
    setVoiceService(service);

    // Save config
    localStorage.setItem('voice_config', JSON.stringify(defaultConfig));
  }, [tenant]);

  // Update tenant when it becomes available
  useEffect(() => {
    if (voiceService && tenant?.id) {
      console.log('[Voice] Updating service with tenant:', tenant.id);
      const intentMatcher = voiceService.getIntentMatcher();
      intentMatcher.loadIntents(voiceService.getConfig().language, tenant.id);
    }
  }, [voiceService, tenant?.id]);

  // Check if onboarding was completed
  useEffect(() => {
    const completed = localStorage.getItem('voice_onboarding_completed');
    if (!completed) {
      setShowOnboarding(true);
    } else {
      // Initialize immediately after onboarding, tenant can be updated later
      console.log('[Voice] Onboarding completed, initializing service...');
      initializeVoiceService();
    }
  }, [initializeVoiceService]);

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

  const handleASRResult = useCallback(async (result: ASRResult) => {
    setTranscript(result.transcript);
    setConfidence(result.confidence);

    if (result.isFinal && voiceService) {
      const intentMatcher = voiceService.getIntentMatcher();
      const utterance = intentMatcher.matchIntent(result.transcript, !isOnline);

      if (utterance) {
        handleIntent(utterance);
      } else {
        // Try AI fallback
        try {
          const aiResponse = await intentMatcher.callAIFallback(
            result.transcript,
            voiceService.getConfig().language,
            { farmerId: user?.id }
          );

          if (aiResponse?.action === 'navigate' && aiResponse.route) {
            await voiceService.speak({ 
              text: aiResponse.response, 
              language: voiceService.getConfig().language 
            });
            if (navigationCallback) {
              navigationCallback(aiResponse.route);
            }
            setTranscript('');
          } else if (aiResponse?.response) {
            await voiceService.speak({ 
              text: aiResponse.response, 
              language: voiceService.getConfig().language 
            });
            setTranscript('');
          }
        } catch (error) {
          console.error('AI fallback error:', error);
          setError('Command not recognized. Try again or say "help" for examples.');
          setTimeout(() => setError(null), 3000);
        }
      }
    }
  }, [voiceService, isOnline, navigationCallback, user]);

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
    // Check if voice service is initialized
    if (!voiceService) {
      console.warn('[Voice] Service not initialized yet. Tenant:', tenant?.id, 'User:', user?.id);
      toast({
        title: "Initializing...",
        description: "Voice assistant is starting up. Please try again in a moment.",
      });
      return;
    }

    // Check browser support with detailed platform info
    if (!voiceService.isSupported()) {
      const platformInfo = getVoicePlatformInfo();
      const savedLang = localStorage.getItem('preferred_language') || 'en';
      const message = getUnsupportedMessage(savedLang, platformInfo.unsupportedReason);
      
      console.error('[Voice] Platform does not support speech recognition:', platformInfo);
      toast({
        title: message.title,
        description: message.description,
        variant: "destructive",
        duration: 6000,
      });
      return;
    }

    console.log('[Voice] Starting listening...');
    setError(null);
    setIsListening(true);
    
    voiceService.startListening(
      handleASRResult,
      () => {
        console.log('[Voice] Stopped listening');
        setIsListening(false);
      }
    );
  }, [voiceService, handleASRResult, toast, tenant, user]);

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

  const showVoiceMode = useCallback(() => {
    console.log('[Voice] Showing voice mode, setting isVoiceModeActive = true');
    setIsVoiceModeActive(true);
  }, []);

  const hideVoiceMode = useCallback(() => {
    console.log('[Voice] Hiding voice mode, setting isVoiceModeActive = false');
    setIsVoiceModeActive(false);
    // Also stop listening if active
    if (isListening) {
      stopListening();
    }
  }, [isListening, stopListening]);

  // Debug log whenever isVoiceModeActive changes
  useEffect(() => {
    console.log('[Voice Context] isVoiceModeActive changed to:', isVoiceModeActive);
  }, [isVoiceModeActive]);

  const examples = voiceService?.getIntentMatcher().getAllIntents().slice(0, 5).flatMap(i => i.patterns.slice(0, 1)) || [];
  const currentLanguage = voiceService?.getConfig().language || 'en';
  const isSupported = voiceService?.isSupported() || false;
  const isReady = !!voiceService && isSupported;

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
        isReady,
        examples,
        error,
        isVoiceModeActive,
        startListening,
        stopListening,
        speak,
        changeLanguage,
        showVoiceMode,
        hideVoiceMode,
        showOnboarding,
        completeOnboarding,
        skipOnboarding,
        setNavigationCallback: (callback: (route: string) => void) => setNavigationCallback(() => callback),
        getDialogManager: () => voiceService?.getDialogManager(),
        getSlotExtractor: () => voiceService?.getSlotExtractor(),
      }}
    >
      {children}
    </ModernVoiceContext.Provider>
  );
};
