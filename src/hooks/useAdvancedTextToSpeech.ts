import { useState, useRef, useEffect, useCallback } from 'react';
import { useTTSStore, PREINSTALLED_VOICES } from '@/stores/ttsStore';
import { voiceDownloadService } from '@/services/voiceDownloadService';

interface UseAdvancedTextToSpeechProps {
  language: string;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export function useAdvancedTextToSpeech({ 
  language, 
  onEnd,
  onError 
}: UseAdvancedTextToSpeechProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [currentSentence, setCurrentSentence] = useState<number>(-1);
  const [progress, setProgress] = useState(0);
  const [fallbackLanguage, setFallbackLanguage] = useState<string | null>(null);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);

  // Use stable selectors instead of full store object
  const settings = useTTSStore(state => state.settings);
  const getPreferredVoiceForLanguage = useTTSStore(state => state.getPreferredVoiceForLanguage);

  // Check browser support and load voices - use getState() to avoid dependency on store
  useEffect(() => {
    const checkSupport = () => {
      const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
      setIsSupported(supported);

      if (supported) {
        const loadVoices = () => {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            // Use getState() to avoid adding store to dependencies
            useTTSStore.getState().updateVoiceAvailability(voices);
            
            // Verify pre-installed voices
            voiceDownloadService.verifyPreInstalledVoices().then(missing => {
              if (missing.length > 0) {
                console.error('❌ [TTS] Critical voices missing:', missing);
                // In production, would trigger emergency download
              }
            });
          }
        };

        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    };

    checkSupport();

    return () => {
      if (window.speechSynthesis?.onvoiceschanged) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []); // No dependencies - runs once on mount

  // Split text into sentences
  const splitIntoSentences = useCallback((text: string): string[] => {
    // Split by sentence boundaries while preserving sentence structure
    return text
      .split(/([.!?।॥]+\s+)/)
      .filter(s => s.trim().length > 0)
      .reduce((acc, curr, i, arr) => {
        if (i % 2 === 0) {
          const next = arr[i + 1] || '';
          acc.push((curr + next).trim());
        }
        return acc;
      }, [] as string[]);
  }, []);

  // Get voice with intelligent fallback
  const getVoiceWithFallback = useCallback(() => {
    const langCode = language.toLowerCase();
    let voice = getPreferredVoiceForLanguage(langCode);
    let usedFallback = null;

    if (!voice) {
      // Try fallback chain: Hindi -> Marathi -> English-IN
      const fallbackChain = ['hi', 'mr', 'en'];
      
      for (const fallbackLang of fallbackChain) {
        voice = getPreferredVoiceForLanguage(fallbackLang);
        if (voice) {
          usedFallback = fallbackLang;
          console.log(`🔄 [TTS] Using fallback: ${fallbackLang} for ${langCode}`);
          break;
        }
      }
    }

    setFallbackLanguage(usedFallback);
    return voice;
  }, [language, getPreferredVoiceForLanguage]);

  // Speak with sentence highlighting
  const speak = useCallback(async (text: string) => {
    if (!isSupported || !text.trim()) return;

    try {
      // Stop any ongoing speech
      window.speechSynthesis.cancel();

      const sentences = splitIntoSentences(text);
      sentencesRef.current = sentences;
      currentIndexRef.current = 0;

      const speakSentence = (index: number) => {
        if (index >= sentences.length) {
          setIsSpeaking(false);
          setCurrentSentence(-1);
          setProgress(100);
          onEnd?.();
          return;
        }

        const sentence = sentences[index];
        const utterance = new SpeechSynthesisUtterance(sentence);

        // Get voice with fallback
        const voice = getVoiceWithFallback();
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }

        // Apply user settings
        utterance.rate = settings.speed;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
          setIsSpeaking(true);
          setCurrentSentence(index);
          const progressPercent = (index / sentences.length) * 100;
          setProgress(progressPercent);
        };

        utterance.onend = () => {
          currentIndexRef.current = index + 1;
          speakSentence(index + 1);
        };

        utterance.onerror = (event) => {
          console.error('[TTS] Speech error:', event);
          setIsSpeaking(false);
          
          if (event.error === 'not-allowed') {
            onError?.('Audio permission denied');
          } else if (event.error === 'network') {
            onError?.('Network error during speech');
          } else {
            onError?.('Speech synthesis failed');
          }
        };

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      };

      speakSentence(0);
    } catch (error) {
      console.error('[TTS] Error in speak:', error);
      onError?.('Failed to start speech');
      setIsSpeaking(false);
    }
  }, [isSupported, splitIntoSentences, getVoiceWithFallback, settings.speed, onEnd, onError]);

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      setCurrentSentence(-1);
      setProgress(0);
      setFallbackLanguage(null);
      currentIndexRef.current = 0;
    }
  }, [isSupported]);

  const pause = useCallback(() => {
    if (isSupported && isSpeaking) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isSupported, isSpeaking]);

  const resume = useCallback(() => {
    if (isSupported && isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isSupported, isPaused]);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isPaused,
    isSupported,
    currentSentence,
    progress,
    fallbackLanguage,
    sentences: sentencesRef.current
  };
}
