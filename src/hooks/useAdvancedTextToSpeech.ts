/**
 * Advanced Text-to-Speech Hook with Hybrid TTS Support
 * Uses Kokoro TTS for high-quality English/Hindi, with Web Speech API fallback
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTTSStore } from '@/stores/ttsStore';
import { Capacitor } from '@capacitor/core';

interface UseAdvancedTextToSpeechProps {
  language: string;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

// Web Speech API synthesis
let synth: SpeechSynthesis | null = null;
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  synth = window.speechSynthesis;
}

export function useAdvancedTextToSpeech({ 
  language, 
  onEnd,
  onError 
}: UseAdvancedTextToSpeechProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [currentSentence, setCurrentSentence] = useState<number>(-1);
  const [progress, setProgress] = useState(0);
  const [fallbackLanguage, setFallbackLanguage] = useState<string | null>(null);

  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const isStoppedRef = useRef(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const speakRequestIdRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const settings = useTTSStore(state => state.settings);

  // Check TTS support
  useEffect(() => {
    const hasWebSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setIsSupported(hasWebSpeech || Capacitor.isNativePlatform());
  }, []);

  // Split text into sentences (supports Hindi, English, and other Indian scripts)
  const splitIntoSentences = useCallback((text: string): string[] => {
    return text
      .split(/([.!?।॥؟۔]+\s*)/)
      .filter(s => s.trim().length > 0)
      .reduce((acc, curr, i, arr) => {
        if (i % 2 === 0) {
          const next = arr[i + 1] || '';
          acc.push((curr + next).trim());
        }
        return acc;
      }, [] as string[]);
  }, []);

  // Clean up progress interval
  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Reset all state
  const resetState = useCallback(() => {
    clearProgressInterval();
    setIsSpeaking(false);
    setIsLoading(false);
    setIsPaused(false);
    setCurrentSentence(-1);
    setProgress(0);
    setFallbackLanguage(null);
    currentIndexRef.current = 0;
  }, [clearProgressInterval]);

  // Get best voice for language
  const getBestVoice = useCallback((langCode: string): SpeechSynthesisVoice | null => {
    if (!synth) return null;
    
    const voices = synth.getVoices();
    const baseLang = langCode.split('-')[0].toLowerCase();
    
    // Priority list for high-quality voices
    const qualityIndicators = ['wavenet', 'neural', 'enhanced', 'premium', 'natural'];
    
    // Find voices matching the language
    const matchingVoices = voices.filter(v => 
      v.lang.toLowerCase().startsWith(baseLang)
    );
    
    if (matchingVoices.length === 0) {
      // Fallback to Hindi for Indian languages, then English
      const fallbackLang = baseLang === 'en' ? 'en' : 'hi';
      const fallbackVoices = voices.filter(v => 
        v.lang.toLowerCase().startsWith(fallbackLang)
      );
      if (fallbackVoices.length > 0) {
        setFallbackLanguage(fallbackLang);
        return fallbackVoices[0];
      }
      return voices[0] || null;
    }
    
    // Try to find a high-quality voice
    for (const indicator of qualityIndicators) {
      const highQualityVoice = matchingVoices.find(v => 
        v.name.toLowerCase().includes(indicator)
      );
      if (highQualityVoice) return highQualityVoice;
    }
    
    // Prefer non-local voices (usually better quality)
    const nonLocalVoice = matchingVoices.find(v => !v.localService);
    if (nonLocalVoice) return nonLocalVoice;
    
    return matchingVoices[0];
  }, []);

  // Get language code
  const getLanguageCode = useCallback((lang: string): string => {
    const baseLang = lang.split('-')[0].toLowerCase();
    const langCodes: Record<string, string> = {
      'hi': 'hi-IN',
      'mr': 'mr-IN',
      'ta': 'ta-IN',
      'te': 'te-IN',
      'bn': 'bn-IN',
      'gu': 'gu-IN',
      'kn': 'kn-IN',
      'ml': 'ml-IN',
      'pa': 'pa-IN',
      'en': 'en-IN',
    };
    return langCodes[baseLang] || `${baseLang}-IN`;
  }, []);

  // Stop function - immediately stops TTS and resets state
  const stop = useCallback(() => {
    console.log('[AdvancedTTS] Stop called');
    isStoppedRef.current = true;
    speakRequestIdRef.current++; // Invalidate any pending callbacks
    
    // Stop Web Speech API
    if (synth) {
      synth.cancel();
    }
    
    // Stop Capacitor TTS
    if (Capacitor.isNativePlatform()) {
      import('@capacitor-community/text-to-speech').then(({ TextToSpeech }) => {
        TextToSpeech.stop().catch(() => {});
      }).catch(() => {});
    }
    
    utteranceRef.current = null;
    resetState();
  }, [resetState]);

  // Pause function
  const pause = useCallback(() => {
    if (synth && isSpeaking && !isPaused) {
      synth.pause();
      setIsPaused(true);
      console.log('[AdvancedTTS] Paused');
    }
  }, [isSpeaking, isPaused]);

  // Resume function
  const resume = useCallback(() => {
    if (synth && isPaused) {
      synth.resume();
      setIsPaused(false);
      console.log('[AdvancedTTS] Resumed');
    }
  }, [isPaused]);

  // Speak using Web Speech API (better for browser/PWA)
  const speakWithWebSpeech = useCallback(async (text: string, requestId: number): Promise<boolean> => {
    if (!synth) {
      console.warn('[AdvancedTTS] Web Speech API not available');
      return false;
    }

    return new Promise((resolve) => {
      // Cancel any existing speech
      synth.cancel();
      
      const langCode = getLanguageCode(language);
      const voice = getBestVoice(langCode);
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langCode;
      utterance.rate = Math.max(0.5, Math.min(2.0, settings.speed || 0.9));
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      if (voice) {
        utterance.voice = voice;
        console.log(`[AdvancedTTS] Using voice: ${voice.name} (${voice.lang})`);
      }
      
      utteranceRef.current = utterance;
      
      utterance.onstart = () => {
        if (requestId !== speakRequestIdRef.current || isStoppedRef.current) {
          synth.cancel();
          return;
        }
        console.log('[AdvancedTTS] Web Speech started');
        setIsLoading(false);
        setIsSpeaking(true);
        setCurrentSentence(0);
      };
      
      utterance.onend = () => {
        if (requestId !== speakRequestIdRef.current) return;
        
        if (!isStoppedRef.current) {
          clearProgressInterval();
          setIsSpeaking(false);
          setIsLoading(false);
          setIsPaused(false);
          setCurrentSentence(-1);
          setProgress(100);
          onEnd?.();
        }
        resolve(true);
      };
      
      utterance.onerror = (event) => {
        if (requestId !== speakRequestIdRef.current) return;
        
        // Ignore cancel/interrupted errors
        if (event.error === 'canceled' || event.error === 'interrupted') {
          console.log('[AdvancedTTS] Speech canceled/interrupted (expected)');
          resolve(true);
          return;
        }
        
        console.error('[AdvancedTTS] Web Speech error:', event.error);
        clearProgressInterval();
        setIsSpeaking(false);
        setIsLoading(false);
        onError?.(event.error || 'Speech synthesis failed');
        resolve(false);
      };
      
      // Track progress by word boundaries
      let wordCount = 0;
      const totalWords = text.split(/\s+/).length;
      
      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          wordCount++;
          const progressPercent = Math.min(100, (wordCount / totalWords) * 100);
          setProgress(progressPercent);
          
          // Update sentence tracking
          const currentChar = event.charIndex;
          const sentences = sentencesRef.current;
          let charSum = 0;
          for (let i = 0; i < sentences.length; i++) {
            charSum += sentences[i].length;
            if (currentChar < charSum) {
              setCurrentSentence(i);
              break;
            }
          }
        }
      };
      
      synth.speak(utterance);
    });
  }, [language, settings.speed, getLanguageCode, getBestVoice, clearProgressInterval, onEnd, onError]);

  // Speak using Capacitor Native TTS (for native apps)
  const speakWithNative = useCallback(async (text: string, requestId: number): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      const langCode = getLanguageCode(language);
      
      await TextToSpeech.speak({
        text: text.trim(),
        lang: langCode,
        rate: Math.max(0.5, Math.min(2.0, settings.speed || 0.9)),
        pitch: 1.0,
        volume: 1.0,
        category: 'ambient',
      });
      
      if (requestId === speakRequestIdRef.current && !isStoppedRef.current) {
        clearProgressInterval();
        setIsSpeaking(false);
        setIsLoading(false);
        setCurrentSentence(-1);
        setProgress(100);
        onEnd?.();
      }
      
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Ignore interrupted errors
      if (errorMsg.toLowerCase().includes('interrupt') || 
          errorMsg.toLowerCase().includes('cancel')) {
        return true;
      }
      
      console.error('[AdvancedTTS] Native TTS error:', errorMsg);
      return false;
    }
  }, [language, settings.speed, getLanguageCode, clearProgressInterval, onEnd]);

  // Main speak function
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    // Mark as stopped = false for new speech
    isStoppedRef.current = false;
    
    // Increment request ID to track this specific request
    const requestId = ++speakRequestIdRef.current;
    
    try {
      clearProgressInterval();

      const sentences = splitIntoSentences(text);
      sentencesRef.current = sentences;
      currentIndexRef.current = 0;
      setProgress(0);
      setCurrentSentence(0);
      setFallbackLanguage(null);
      
      // Set loading state immediately for instant UI feedback
      setIsLoading(true);
      setIsSpeaking(false);
      setIsPaused(false);

      console.log(`[AdvancedTTS] Starting speech: lang=${language}, sentences=${sentences.length}, requestId=${requestId}`);

      // Try Web Speech API first (works in both browser and PWA)
      // It has better voice quality on most systems
      const webSpeechSuccess = await speakWithWebSpeech(text, requestId);
      
      if (!webSpeechSuccess && Capacitor.isNativePlatform()) {
        // Fall back to native TTS
        console.log('[AdvancedTTS] Falling back to native TTS');
        setIsLoading(true);
        setIsSpeaking(false);
        
        const nativeSuccess = await speakWithNative(text, requestId);
        
        if (!nativeSuccess && requestId === speakRequestIdRef.current) {
          throw new Error('Both Web Speech and Native TTS failed');
        }
      }

    } catch (error) {
      // Only handle error if still the active request
      if (requestId === speakRequestIdRef.current) {
        clearProgressInterval();
        console.error('[AdvancedTTS] Error in speak:', error);
        onError?.('Failed to start speech');
        setIsSpeaking(false);
        setIsLoading(false);
        setIsPaused(false);
      }
    }
  }, [language, splitIntoSentences, speakWithWebSpeech, speakWithNative, clearProgressInterval, onError]);

  // Ensure voices are loaded
  useEffect(() => {
    if (synth) {
      // Load voices (they may not be available immediately)
      const loadVoices = () => {
        const voices = synth.getVoices();
        console.log(`[AdvancedTTS] Voices loaded: ${voices.length}`);
      };
      
      loadVoices();
      synth.onvoiceschanged = loadVoices;
      
      return () => {
        synth.onvoiceschanged = null;
      };
    }
  }, []);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isLoading,
    isPaused,
    isSupported,
    currentSentence,
    progress,
    fallbackLanguage,
    sentences: sentencesRef.current
  };
}
