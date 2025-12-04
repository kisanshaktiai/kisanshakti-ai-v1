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
  const [isPaused] = useState(false); // Native TTS doesn't support pause
  const [isSupported] = useState(true);
  const [currentSentence, setCurrentSentence] = useState<number>(-1);
  const [progress, setProgress] = useState(0);
  const [fallbackLanguage, setFallbackLanguage] = useState<string | null>(null);

  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const isStoppedRef = useRef(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // Speak with sentence-by-sentence progress simulation
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    try {
      isStoppedRef.current = false;
      clearProgressInterval();

      const sentences = splitIntoSentences(text);
      sentencesRef.current = sentences;
      currentIndexRef.current = 0;
      setProgress(0);
      setCurrentSentence(0);
      
      // INSTANT: Set loading state immediately for UI feedback
      setIsLoading(true);
      setIsSpeaking(true);
      setFallbackLanguage(null);

      console.log(`[AdvancedTTS] Starting speech: lang=${language}, sentences=${sentences.length}`);

      const result = await nativeTTSService.speak(
        text,
        language,
        { rate: settings.speed, pitch: 1.0, volume: 1.0 },
        {
          onStart: () => {
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
            if (sentences.length > 1 && !isStoppedRef.current) {
              const avgDuration = (text.length / 12) * 1000; // ~12 chars/sec for Indian languages
              const intervalTime = avgDuration / sentences.length;
              
              let sentenceIdx = 0;
              progressIntervalRef.current = setInterval(() => {
                if (isStoppedRef.current || sentenceIdx >= sentences.length - 1) {
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
            clearProgressInterval();
            setIsSpeaking(false);
            setIsLoading(false);
            setCurrentSentence(-1);
            setProgress(100);
            onEnd?.();
          },
          onError: (err) => {
            clearProgressInterval();
            console.error('[AdvancedTTS] Error:', err);
            setIsSpeaking(false);
            setIsLoading(false);
            setCurrentSentence(-1);
            onError?.(err.message || 'Speech synthesis failed');
          }
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'TTS failed');
      }

      console.log(`[AdvancedTTS] ✅ Provider: ${result.provider}, Used: ${result.usedLanguage}`);
    } catch (error) {
      clearProgressInterval();
      console.error('[AdvancedTTS] Error in speak:', error);
      onError?.('Failed to start speech');
      setIsSpeaking(false);
      setIsLoading(false);
    }
  }, [language, splitIntoSentences, settings.speed, onEnd, onError, clearProgressInterval]);

  const stop = useCallback(() => {
    isStoppedRef.current = true;
    clearProgressInterval();
    nativeTTSService.stop();
    setIsSpeaking(false);
    setIsLoading(false);
    setCurrentSentence(-1);
    setProgress(0);
    setFallbackLanguage(null);
    currentIndexRef.current = 0;
  }, [clearProgressInterval]);

  // Native TTS doesn't support pause/resume
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
    isPaused,
    isSupported,
    currentSentence,
    progress,
    fallbackLanguage,
    sentences: sentencesRef.current
  };
}
