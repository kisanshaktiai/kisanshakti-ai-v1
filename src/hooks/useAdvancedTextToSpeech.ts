import { useState, useRef, useCallback } from 'react';
import { nativeTTSService } from '@/services/nativeTTSService';
import { useTTSStore } from '@/stores/ttsStore';

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
  const [isSupported] = useState(true);
  const [currentSentence, setCurrentSentence] = useState<number>(-1);
  const [progress, setProgress] = useState(0);
  const [fallbackLanguage, setFallbackLanguage] = useState<string | null>(null);

  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const isStoppedRef = useRef(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const speakRequestIdRef = useRef(0);

  const settings = useTTSStore(state => state.settings);

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
    setCurrentSentence(-1);
    setProgress(0);
    setFallbackLanguage(null);
    currentIndexRef.current = 0;
  }, [clearProgressInterval]);

  // Stop function - immediately stops TTS and resets state
  const stop = useCallback(() => {
    console.log('[AdvancedTTS] Stop called');
    isStoppedRef.current = true;
    speakRequestIdRef.current++; // Invalidate any pending callbacks
    nativeTTSService.stop();
    resetState();
  }, [resetState]);

  // Speak with sentence-by-sentence progress simulation
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
      
      // Set loading state immediately for instant UI feedback
      setIsLoading(true);
      setIsSpeaking(false);
      setFallbackLanguage(null);

      console.log(`[AdvancedTTS] Starting speech: lang=${language}, sentences=${sentences.length}, requestId=${requestId}`);

      const result = await nativeTTSService.speak(
        text,
        language,
        { rate: settings.speed, pitch: 1.0, volume: 1.0 },
        {
          onStart: () => {
            // Check if this request is still valid
            if (requestId !== speakRequestIdRef.current || isStoppedRef.current) {
              console.log('[AdvancedTTS] onStart ignored - request cancelled');
              return;
            }
            
            // Audio is now actually playing
            setIsLoading(false);
            setIsSpeaking(true);
            setCurrentSentence(0);
            
            // Check if fallback was used
            const langInfo = nativeTTSService.getLanguageCode(language);
            if (langInfo.isFallback) {
              const fallbackInfo = nativeTTSService.getLanguageInfo(langInfo.code);
              setFallbackLanguage(fallbackInfo?.nativeName || langInfo.code);
            }
            
            // Simulate sentence progress for UI
            if (sentences.length > 1) {
              const avgDuration = (text.length / 12) * 1000; // ~12 chars/sec for Indian languages
              const intervalTime = avgDuration / sentences.length;
              
              let sentenceIdx = 0;
              progressIntervalRef.current = setInterval(() => {
                if (isStoppedRef.current || requestId !== speakRequestIdRef.current || sentenceIdx >= sentences.length - 1) {
                  clearProgressInterval();
                  return;
                }
                sentenceIdx++;
                setCurrentSentence(sentenceIdx);
                setProgress((sentenceIdx / sentences.length) * 100);
              }, intervalTime);
            }
          },
          onEnd: () => {
            // Check if this request is still valid
            if (requestId !== speakRequestIdRef.current) {
              console.log('[AdvancedTTS] onEnd ignored - different request active');
              return;
            }
            
            // Only call onEnd if not explicitly stopped
            if (!isStoppedRef.current) {
              clearProgressInterval();
              setIsSpeaking(false);
              setIsLoading(false);
              setCurrentSentence(-1);
              setProgress(100);
              onEnd?.();
            }
          },
          onError: (err) => {
            // Check if this request is still valid
            if (requestId !== speakRequestIdRef.current) {
              console.log('[AdvancedTTS] onError ignored - different request active');
              return;
            }
            
            clearProgressInterval();
            const errorMsg = err.message || 'Speech synthesis failed';
            
            // Ignore "interrupted" or "canceled" errors - these are expected when stopping
            const isInterruptedError = 
              errorMsg.toLowerCase().includes('interrupt') ||
              errorMsg.toLowerCase().includes('cancel') ||
              errorMsg.toLowerCase().includes('aborted');
            
            if (isInterruptedError) {
              console.log('[AdvancedTTS] Ignoring interrupted/canceled error');
              // Don't reset state or call onError for expected interruptions
              return;
            }
            
            console.error('[AdvancedTTS] Error:', errorMsg);
            setIsSpeaking(false);
            setIsLoading(false);
            setCurrentSentence(-1);
            onError?.(errorMsg);
          }
        }
      );

      // Only log if still the active request
      if (requestId === speakRequestIdRef.current && result.success) {
        console.log(`[AdvancedTTS] ✅ Provider: ${result.provider}, Used: ${result.usedLanguage}`);
      }
    } catch (error) {
      // Only handle error if still the active request
      if (requestId === speakRequestIdRef.current) {
        clearProgressInterval();
        console.error('[AdvancedTTS] Error in speak:', error);
        onError?.('Failed to start speech');
        setIsSpeaking(false);
        setIsLoading(false);
      }
    }
  }, [language, splitIntoSentences, settings.speed, onEnd, onError, clearProgressInterval]);

  // Pause/Resume not supported by native TTS
  const pause = useCallback(() => {
    console.warn('[AdvancedTTS] Pause not supported on native TTS');
  }, []);

  const resume = useCallback(() => {
    console.warn('[AdvancedTTS] Resume not supported on native TTS');
  }, []);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isLoading,
    isPaused: false, // Native TTS doesn't support pause
    isSupported,
    currentSentence,
    progress,
    fallbackLanguage,
    sentences: sentencesRef.current
  };
}
