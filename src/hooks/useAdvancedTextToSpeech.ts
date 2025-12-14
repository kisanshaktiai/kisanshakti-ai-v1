/**
 * Advanced Text-to-Speech Hook with Google Cloud TTS + Native Fallback
 * Uses Google Cloud TTS API (via edge function) for high-quality voices online
 * Falls back to native TTS when offline or on native platforms
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTTSStore } from '@/stores/ttsStore';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';

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
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [currentSentence, setCurrentSentence] = useState<number>(-1);
  const [progress, setProgress] = useState(0);
  const [fallbackLanguage, setFallbackLanguage] = useState<string | null>(null);
  const [provider, setProvider] = useState<'google' | 'native' | 'web'>('google');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isStoppedRef = useRef(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const speakRequestIdRef = useRef(0);
  
  const settings = useTTSStore(state => state.settings);
  const isOnline = useOfflineStatus();

  // Check TTS support
  useEffect(() => {
    const hasWebSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setIsSupported(hasWebSpeech || Capacitor.isNativePlatform());
  }, []);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // Get language code for API
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

  // Clear progress interval
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
  }, [clearProgressInterval]);

  // Stop function
  const stop = useCallback(() => {
    console.log('[AdvancedTTS] Stop called');
    isStoppedRef.current = true;
    speakRequestIdRef.current++;
    
    // Stop HTML5 Audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    // Stop Web Speech API
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    // Stop Capacitor Native TTS
    if (Capacitor.isNativePlatform()) {
      import('@capacitor-community/text-to-speech').then(({ TextToSpeech }) => {
        TextToSpeech.stop().catch(() => {});
      }).catch(() => {});
    }
    
    resetState();
  }, [resetState]);

  // Pause function
  const pause = useCallback(() => {
    if (isSpeaking && !isPaused) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.pause();
      }
      setIsPaused(true);
      console.log('[AdvancedTTS] Paused');
    }
  }, [isSpeaking, isPaused]);

  // Resume function
  const resume = useCallback(() => {
    if (isPaused) {
      if (audioRef.current) {
        audioRef.current.play().catch(console.error);
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.resume();
      }
      setIsPaused(false);
      console.log('[AdvancedTTS] Resumed');
    }
  }, [isPaused]);

  // ✅ GOOGLE CLOUD TTS via Edge Function - High quality Wavenet voices
  const speakWithGoogleTTS = useCallback(async (text: string, requestId: number): Promise<boolean> => {
    console.log('[AdvancedTTS] Attempting Google Cloud TTS');
    
    try {
      const langCode = getLanguageCode(language);
      
      // Call edge function
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { text, language: langCode }
      });
      
      if (error) {
        console.error('[AdvancedTTS] Edge function error:', error);
        return false;
      }
      
      if (!data?.audioContent) {
        console.error('[AdvancedTTS] No audio content received');
        return false;
      }
      
      // Check if stopped during API call
      if (requestId !== speakRequestIdRef.current || isStoppedRef.current) {
        console.log('[AdvancedTTS] Request cancelled');
        return true;
      }
      
      // Create audio element and play
      const audioBlob = base64ToBlob(data.audioContent, 'audio/mp3');
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Cleanup old audio
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      
      audioRef.current = new Audio(audioUrl);
      audioRef.current.playbackRate = Math.max(0.5, Math.min(2.0, settings.speed || 1.0));
      
      return new Promise((resolve) => {
        if (!audioRef.current) {
          resolve(false);
          return;
        }
        
        audioRef.current.onloadedmetadata = () => {
          const duration = audioRef.current?.duration || 0;
          
          // Start progress tracking
          progressIntervalRef.current = setInterval(() => {
            if (audioRef.current && duration > 0) {
              const currentProgress = (audioRef.current.currentTime / duration) * 100;
              setProgress(Math.min(100, currentProgress));
            }
          }, 100);
        };
        
        audioRef.current.onplay = () => {
          if (requestId !== speakRequestIdRef.current) return;
          setIsLoading(false);
          setIsSpeaking(true);
          setProvider('google');
          console.log(`[AdvancedTTS] Google TTS playing (provider: ${data.provider})`);
        };
        
        audioRef.current.onended = () => {
          if (requestId !== speakRequestIdRef.current) return;
          clearProgressInterval();
          setProgress(100);
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          onEnd?.();
          resolve(true);
        };
        
        audioRef.current.onerror = (e) => {
          if (requestId !== speakRequestIdRef.current) return;
          console.error('[AdvancedTTS] Audio playback error:', e);
          clearProgressInterval();
          URL.revokeObjectURL(audioUrl);
          resolve(false);
        };
        
        audioRef.current.play().catch((err) => {
          console.error('[AdvancedTTS] Play failed:', err);
          clearProgressInterval();
          URL.revokeObjectURL(audioUrl);
          resolve(false);
        });
      });
      
    } catch (error) {
      console.error('[AdvancedTTS] Google TTS error:', error);
      return false;
    }
  }, [language, settings.speed, getLanguageCode, clearProgressInterval, onEnd]);

  // Native TTS fallback (for native apps or offline)
  const speakWithNativeTTS = useCallback(async (text: string, requestId: number): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }
    
    console.log('[AdvancedTTS] Using Native TTS');
    
    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      const langCode = getLanguageCode(language);
      
      setIsLoading(false);
      setIsSpeaking(true);
      setProvider('native');
      
      await TextToSpeech.speak({
        text: text.trim(),
        lang: langCode,
        rate: Math.max(0.5, Math.min(2.0, settings.speed || 1.0)),
        pitch: 1.0,
        volume: 1.0,
        category: 'ambient',
      });
      
      if (requestId === speakRequestIdRef.current && !isStoppedRef.current) {
        clearProgressInterval();
        setIsSpeaking(false);
        setProgress(100);
        onEnd?.();
      }
      
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (errorMsg.toLowerCase().includes('interrupt') || 
          errorMsg.toLowerCase().includes('cancel')) {
        return true;
      }
      
      console.error('[AdvancedTTS] Native TTS error:', errorMsg);
      return false;
    }
  }, [language, settings.speed, getLanguageCode, clearProgressInterval, onEnd]);

  // Web Speech API fallback (browser offline fallback)
  const speakWithWebSpeech = useCallback(async (text: string, requestId: number): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return false;
    }
    
    console.log('[AdvancedTTS] Using Web Speech API fallback');
    const synth = window.speechSynthesis;
    
    return new Promise((resolve) => {
      synth.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      const langCode = getLanguageCode(language);
      utterance.lang = langCode;
      utterance.rate = Math.max(0.5, Math.min(2.0, settings.speed || 1.0));
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      // Try to find a good voice
      const voices = synth.getVoices();
      const baseLang = language.split('-')[0].toLowerCase();
      const matchingVoice = voices.find(v => 
        v.lang.toLowerCase().startsWith(baseLang)
      );
      
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      
      utterance.onstart = () => {
        if (requestId !== speakRequestIdRef.current || isStoppedRef.current) {
          synth.cancel();
          return;
        }
        setIsLoading(false);
        setIsSpeaking(true);
        setProvider('web');
      };
      
      utterance.onend = () => {
        if (requestId !== speakRequestIdRef.current) return;
        clearProgressInterval();
        setProgress(100);
        setIsSpeaking(false);
        onEnd?.();
        resolve(true);
      };
      
      utterance.onerror = (event) => {
        if (requestId !== speakRequestIdRef.current) return;
        if (event.error === 'canceled' || event.error === 'interrupted') {
          resolve(true);
          return;
        }
        console.error('[AdvancedTTS] Web Speech error:', event.error);
        clearProgressInterval();
        setIsSpeaking(false);
        resolve(false);
      };
      
      // Simple word-based progress tracking
      let wordCount = 0;
      const totalWords = text.split(/\s+/).length;
      
      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          wordCount++;
          const progressPercent = Math.min(100, (wordCount / totalWords) * 100);
          setProgress(progressPercent);
        }
      };
      
      synth.speak(utterance);
    });
  }, [language, settings.speed, getLanguageCode, clearProgressInterval, onEnd]);

  // Main speak function with hybrid approach
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    isStoppedRef.current = false;
    const requestId = ++speakRequestIdRef.current;
    
    try {
      clearProgressInterval();
      setProgress(0);
      setCurrentSentence(0);
      setFallbackLanguage(null);
      setIsLoading(true);
      setIsSpeaking(false);
      setIsPaused(false);
      
      console.log(`[AdvancedTTS] Starting speech: lang=${language}, online=${isOnline}, requestId=${requestId}`);
      
      let success = false;
      
      // ✅ Strategy: Online → Google Cloud TTS, Offline/Native → Native TTS, Fallback → Web Speech
      if (isOnline && !Capacitor.isNativePlatform()) {
        // Online browser/PWA → Use Google Cloud TTS for high quality Wavenet voices
        success = await speakWithGoogleTTS(text, requestId);
      }
      
      if (!success && Capacitor.isNativePlatform()) {
        // Native platform → Use Native TTS
        success = await speakWithNativeTTS(text, requestId);
      }
      
      if (!success) {
        // Final fallback → Web Speech API
        setFallbackLanguage('web');
        success = await speakWithWebSpeech(text, requestId);
      }
      
      if (!success && requestId === speakRequestIdRef.current) {
        throw new Error('All TTS methods failed');
      }
      
    } catch (error) {
      if (requestId === speakRequestIdRef.current) {
        clearProgressInterval();
        console.error('[AdvancedTTS] Error:', error);
        onError?.('Failed to start speech');
        setIsSpeaking(false);
        setIsLoading(false);
        setIsPaused(false);
      }
    }
  }, [language, isOnline, speakWithGoogleTTS, speakWithNativeTTS, speakWithWebSpeech, clearProgressInterval, onError]);

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
    provider,
    sentences: []
  };
}

// Helper: Convert base64 to Blob
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}
