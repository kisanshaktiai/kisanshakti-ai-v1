/**
 * Text-to-Speech Hook with Web Speech API
 * Uses Web Speech API for better voice quality in browser/PWA
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

// Web Speech API synthesis
let synth: SpeechSynthesis | null = null;
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  synth = window.speechSynthesis;
}

interface UseTextToSpeechProps {
  language?: string;
  rate?: number;
  pitch?: number;
  onError?: (error: string) => void;
}

export function useTextToSpeech({ 
  language = 'hi', 
  rate = 0.9,
  pitch = 1.0,
  onError
}: UseTextToSpeechProps = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [isVoicesLoaded, setIsVoicesLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speakingRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check TTS support
  useEffect(() => {
    const hasWebSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setIsSupported(hasWebSpeech || Capacitor.isNativePlatform());
  }, []);

  // Load voices
  useEffect(() => {
    if (synth) {
      const loadVoices = () => {
        const voices = synth!.getVoices();
        setIsVoicesLoaded(voices.length > 0);
      };
      
      loadVoices();
      synth.onvoiceschanged = loadVoices;
      
      return () => {
        if (synth) synth.onvoiceschanged = null;
      };
    }
  }, []);

  // Get language code
  const getLanguageCode = useCallback((lang: string): string => {
    const baseLang = lang.split('-')[0].toLowerCase();
    const langCodes: Record<string, string> = {
      'hi': 'hi-IN', 'mr': 'mr-IN', 'ta': 'ta-IN', 'te': 'te-IN',
      'bn': 'bn-IN', 'gu': 'gu-IN', 'kn': 'kn-IN', 'ml': 'ml-IN',
      'pa': 'pa-IN', 'en': 'en-IN',
    };
    return langCodes[baseLang] || `${baseLang}-IN`;
  }, []);

  // Get best voice for language
  const getBestVoice = useCallback((langCode: string): SpeechSynthesisVoice | null => {
    if (!synth) return null;
    
    const voices = synth.getVoices();
    const baseLang = langCode.split('-')[0].toLowerCase();
    
    // Find voices matching the language
    const matchingVoices = voices.filter(v => 
      v.lang.toLowerCase().startsWith(baseLang)
    );
    
    if (matchingVoices.length === 0) {
      // Fallback to Hindi, then English
      const fallbackLang = baseLang === 'en' ? 'en' : 'hi';
      const fallbackVoices = voices.filter(v => 
        v.lang.toLowerCase().startsWith(fallbackLang)
      );
      return fallbackVoices[0] || voices[0] || null;
    }
    
    // Prefer high-quality voices
    const qualityIndicators = ['wavenet', 'neural', 'enhanced', 'premium'];
    for (const indicator of qualityIndicators) {
      const hqVoice = matchingVoices.find(v => 
        v.name.toLowerCase().includes(indicator)
      );
      if (hqVoice) return hqVoice;
    }
    
    // Prefer non-local voices
    const nonLocalVoice = matchingVoices.find(v => !v.localService);
    return nonLocalVoice || matchingVoices[0];
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;

    try {
      setError(null);
      setIsSpeaking(true);
      speakingRef.current = true;

      // Use Web Speech API if available
      if (synth) {
        synth.cancel();
        
        const langCode = getLanguageCode(language);
        const voice = getBestVoice(langCode);
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langCode;
        utterance.rate = Math.max(0.5, Math.min(2.0, rate));
        utterance.pitch = Math.max(0.5, Math.min(2.0, pitch));
        utterance.volume = 1.0;
        
        if (voice) utterance.voice = voice;
        
        utteranceRef.current = utterance;
        
        utterance.onstart = () => {
          setIsSpeaking(true);
          speakingRef.current = true;
        };
        
        utterance.onend = () => {
          setIsSpeaking(false);
          speakingRef.current = false;
        };
        
        utterance.onerror = (event) => {
          if (event.error === 'canceled' || event.error === 'interrupted') return;
          const errorMsg = event.error || 'Speech synthesis failed';
          setError(errorMsg);
          onError?.(errorMsg);
          setIsSpeaking(false);
          speakingRef.current = false;
        };
        
        synth.speak(utterance);
        console.log(`[TTS] Speaking with voice: ${voice?.name || 'default'}`);
      } else if (Capacitor.isNativePlatform()) {
        // Fallback to native TTS
        const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
        const langCode = getLanguageCode(language);
        
        await TextToSpeech.speak({
          text: text.trim(),
          lang: langCode,
          rate: Math.max(0.5, Math.min(2.0, rate)),
          pitch: Math.max(0.5, Math.min(2.0, pitch)),
          volume: 1.0,
          category: 'ambient',
        });
        
        setIsSpeaking(false);
        speakingRef.current = false;
      }
    } catch (err) {
      console.error('Error in speak function:', err);
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMsg);
      onError?.(errorMsg);
      setIsSpeaking(false);
      speakingRef.current = false;
    }
  }, [language, rate, pitch, onError, getLanguageCode, getBestVoice]);

  const stop = useCallback(() => {
    try {
      if (synth) synth.cancel();
      
      if (Capacitor.isNativePlatform()) {
        import('@capacitor-community/text-to-speech').then(({ TextToSpeech }) => {
          TextToSpeech.stop().catch(() => {});
        }).catch(() => {});
      }
      
      utteranceRef.current = null;
      setIsSpeaking(false);
      speakingRef.current = false;
      setError(null);
    } catch (err) {
      console.error('Error stopping speech:', err);
    }
  }, []);

  const pause = useCallback(() => {
    if (synth && speakingRef.current) {
      synth.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (synth) {
      synth.resume();
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setError(null);
  }, [stop]);

  return {
    speak,
    stop,
    pause,
    resume,
    reset,
    isSpeaking,
    isSupported,
    isVoicesLoaded,
    error,
  };
}
