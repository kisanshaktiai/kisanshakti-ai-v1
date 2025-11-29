/**
 * @deprecated This context is deprecated. Use ModernVoiceContext instead.
 * 
 * VoiceNavigationContext is kept for backward compatibility but will be removed in future versions.
 * Please migrate to ModernVoiceContext which provides:
 * - Stateful dialog management with context tracking
 * - Slot extraction and parameter handling
 * - Multi-turn corrections and confirmations
 * - Comprehensive intent catalog (CRUD, forms, navigation, help)
 * - Better offline support
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguageStore } from '@/stores/languageStore';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useToast } from '@/hooks/use-toast';

interface VoiceNavigationContextType {
  isListening: boolean;
  isSpeaking: boolean;
  isEnabled: boolean;
  isSupported: boolean;
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

// ============ Utility Functions ============

function normalizeText(s: string): string {
  try { 
    return s.normalize('NFKD').toLowerCase().trim(); 
  } catch { 
    return s.toLowerCase().trim(); 
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasKeywordWordBoundary(text: string, keyword: string): boolean {
  const re = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
  return re.test(text);
}

function mapLanguage(langCode: string): string {
  const code = (langCode || 'en').toLowerCase();
  const map: Record<string, string> = {
    'hi': 'hi-IN',
    'pa': 'pa-IN',
    'mr': 'mr-IN',
    'ta': 'ta-IN',
    'en': 'en-IN'
  };
  return map[code] || (code.length === 2 ? `${code}-IN` : 'en-IN');
}

function trackEvent(name: string, payload: Record<string, any> = {}) {
  try {
    // Privacy: Never persist raw transcripts
    const sanitizedPayload = { ...payload };
    delete sanitizedPayload.transcript;
    
    if ((window as any)?.analytics?.track) {
      (window as any).analytics.track(name, sanitizedPayload);
    }
    
    console.log(`[Voice Telemetry] ${name}`, sanitizedPayload);
  } catch (e) {
    // Silent fail for telemetry
  }
}

// ============ Voice Commands ============

const VOICE_COMMANDS: Record<string, { 
  keywords: string[]; 
  action: string; 
  route?: string;
  announcement?: string;
}> = {
  home: { 
    keywords: ['home', 'घर', 'ਘਰ', 'मुख्य', 'होम'], 
    action: 'navigate', 
    route: '/app',
    announcement: 'Opening Home'
  },
  lands: { 
    keywords: ['land', 'lands', 'जमीन', 'ਜ਼ਮੀਨ', 'खेत', 'farm', 'farms'], 
    action: 'navigate', 
    route: '/lands',
    announcement: 'Opening Lands'
  },
  weather: { 
    keywords: ['weather', 'मौसम', 'ਮੌਸਮ', 'वातावरण'], 
    action: 'navigate', 
    route: '/weather',
    announcement: 'Opening Weather'
  },
  schedule: { 
    keywords: ['schedule', 'समय', 'ਸਮਾਂ', 'कार्यक्रम', 'शेड्यूल'], 
    action: 'navigate', 
    route: '/schedule',
    announcement: 'Opening Schedule'
  },
  chat: { 
    keywords: ['chat', 'बात', 'ਗੱਲਬਾਤ', 'सहायक', 'assistant'], 
    action: 'navigate', 
    route: '/chat',
    announcement: 'Opening Chat'
  },
  market: { 
    keywords: ['market', 'बाजार', 'ਬਾਜ਼ਾਰ', 'marketplace'], 
    action: 'navigate', 
    route: '/market',
    announcement: 'Opening Market'
  },
  profile: { 
    keywords: ['profile', 'प्रोफ़ाइल', 'ਪ੍ਰੋਫਾਈਲ', 'account'], 
    action: 'navigate', 
    route: '/profile',
    announcement: 'Opening Profile'
  },
  community: { 
    keywords: ['community', 'समुदाय', 'ਕਮਿਊਨਿਟੀ', 'social'], 
    action: 'navigate', 
    route: '/social',
    announcement: 'Opening Community'
  },
  analytics: { 
    keywords: ['analytics', 'विश्लेषण', 'ਵਿਸ਼ਲੇਸ਼ਣ', 'stats', 'statistics'], 
    action: 'navigate', 
    route: '/analytics',
    announcement: 'Opening Analytics'
  },
};

// ============ Provider Component ============

export const VoiceNavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { currentLanguage } = useLanguageStore();
  const { toast } = useToast();
  const [isEnabled] = useState(true);

  // Cooldown tracking
  const lastCommandAtRef = useRef<Record<string, number>>({});
  const transcriptHandlerRef = useRef<(text: string, confidence?: number) => void>();

  const GLOBAL_COOLDOWN_MS = 800;
  const PER_COMMAND_COOLDOWN_MS = 2000;
  const CONFIDENCE_THRESHOLD = 0.55;

  const { speak, stop: stopSpeech, isSpeaking } = useTextToSpeech({
    language: currentLanguage,
  });

  // Stable onTranscript callback
  const onTranscript = useCallback((text: string, confidence?: number) => {
    if (transcriptHandlerRef.current) {
      transcriptHandlerRef.current(text, confidence);
    }
  }, []);

  const {
    isListening,
    startListening: startListeningHook,
    stopListening: stopListeningHook,
    isSupported,
  } = useSpeechRecognition({
    onTranscript,
    language: mapLanguage(currentLanguage),
  });

  // Robust transcript handler
  useEffect(() => {
    transcriptHandlerRef.current = async (rawTranscript: string, confidence?: number) => {
      if (!rawTranscript) return;
      
      const transcript = normalizeText(rawTranscript);
      console.log('[Voice] Transcript:', transcript, 'Confidence:', confidence);

      // Confidence check
      if (typeof confidence === 'number' && confidence < CONFIDENCE_THRESHOLD) {
        toast({ 
          title: 'Voice not clear', 
          description: 'Please speak clearly and try again', 
          variant: 'destructive' 
        });
        trackEvent('voice_low_confidence', { confidence });
        return;
      }

      // Global throttle
      const now = Date.now();
      const lastGlobal = lastCommandAtRef.current['_global'] || 0;
      if (now - lastGlobal < GLOBAL_COOLDOWN_MS) {
        console.log('[Voice] Global cooldown active, ignoring');
        return;
      }
      lastCommandAtRef.current['_global'] = now;

      // Try to find matching command
      for (const [commandName, command] of Object.entries(VOICE_COMMANDS)) {
        const matched = command.keywords.some(k => hasKeywordWordBoundary(transcript, k));
        if (!matched) continue;

        // Per-command cooldown
        const lastForCmd = lastCommandAtRef.current[commandName] || 0;
        if (now - lastForCmd < PER_COMMAND_COOLDOWN_MS) {
          console.log(`[Voice] Command ${commandName} cooldown active, ignoring`);
          return;
        }
        lastCommandAtRef.current[commandName] = now;

        // Execute command
        try {
          console.log(`[Voice] Executing command: ${commandName}`);
          
          if (stopListeningHook) stopListeningHook();
          if (stopSpeech) stopSpeech();

          // Announce and navigate
          const announcement = command.announcement || `Opening ${commandName}`;
          if (speak) {
            speak(announcement);
            // Brief delay to let TTS start
            await new Promise(resolve => setTimeout(resolve, 450));
          }

          if (command.route) {
            navigate(command.route);
          }

          toast({ 
            title: 'Voice Command', 
            description: `Navigated to ${commandName}` 
          });

          trackEvent('voice_command_executed', { 
            command: commandName, 
            confidence,
            language: currentLanguage 
          });

          return;

        } catch (err) {
          console.error('[Voice] Command execution failed', err);
          toast({ 
            title: 'Command failed', 
            description: 'Please try again', 
            variant: 'destructive' 
          });
          trackEvent('voice_command_failed', { 
            command: commandName, 
            error: String(err) 
          });
          return;
        }
      }

      // No match found
      toast({ 
        title: 'Command not recognized', 
        description: 'Try: "home", "weather", "lands", "schedule"', 
        variant: 'destructive' 
      });
      trackEvent('voice_command_unmatched', { confidence });
    };
  }, [navigate, speak, stopSpeech, stopListeningHook, toast, currentLanguage]);

  const startListening = useCallback(() => {
    if (startListeningHook) {
      startListeningHook();
      trackEvent('voice_listen_start', { language: currentLanguage });
    }
  }, [startListeningHook, currentLanguage]);

  const stopListening = useCallback(() => {
    if (stopListeningHook) {
      stopListeningHook();
      trackEvent('voice_listen_stop');
    }
  }, [stopListeningHook]);

  const toggleVoiceNavigation = useCallback(() => {
    // Simplified - always enabled
  }, []);

  const announceElement = useCallback((element: string) => {
    if (isEnabled && speak) {
      speak(element);
      const announcer = document.getElementById('voice-announcer');
      if (announcer) {
        announcer.textContent = element;
      }
    }
  }, [isEnabled, speak]);

  const value: VoiceNavigationContextType = {
    isListening,
    isSpeaking,
    isEnabled: true,
    isSupported,
    startListening,
    stopListening,
    speak: speak || (() => {}),
    stopSpeaking: stopSpeech || (() => {}),
    toggleVoiceNavigation,
    announceElement,
  };

  return (
    <VoiceNavigationContext.Provider value={value}>
      {children}
    </VoiceNavigationContext.Provider>
  );
};
