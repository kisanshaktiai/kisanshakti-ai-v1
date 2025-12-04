import { useState, useRef, useCallback } from 'react';
import { universalTTSService } from '@/services/universalTTSService';
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
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported] = useState(true); // Universal TTS always supported
  const [currentSentence, setCurrentSentence] = useState<number>(-1);
  const [progress, setProgress] = useState(0);
  const [fallbackLanguage, setFallbackLanguage] = useState<string | null>(null);

  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const isStoppedRef = useRef(false);

  const settings = useTTSStore(state => state.settings);

  // Split text into sentences
  const splitIntoSentences = useCallback((text: string): string[] => {
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

  // Speak with sentence-by-sentence progress
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    // Prevent multiple concurrent calls
    if (isSpeaking) {
      console.log('[AdvancedTTS] Already speaking, stopping first');
      universalTTSService.stop();
      setIsSpeaking(false);
    }

    try {
      isStoppedRef.current = false;

      const sentences = splitIntoSentences(text);
      sentencesRef.current = sentences;
      currentIndexRef.current = 0;
      setProgress(0);
      setCurrentSentence(0);
      setIsSpeaking(true);

      // For cloud TTS, speak all at once (better quality)
      // Track progress based on estimated timing
      const result = await universalTTSService.speak({
        text,
        language,
        rate: settings.speed,
        onStart: () => {
          setIsSpeaking(true);
          setCurrentSentence(0);
          
          // Simulate sentence progress for UI
          if (sentences.length > 1) {
            const avgDuration = (text.length / 15) * 1000; // ~15 chars/sec
            const intervalTime = avgDuration / sentences.length;
            
            let sentenceIdx = 0;
            const progressInterval = setInterval(() => {
              if (isStoppedRef.current || sentenceIdx >= sentences.length - 1) {
                clearInterval(progressInterval);
                return;
              }
              sentenceIdx++;
              setCurrentSentence(sentenceIdx);
              setProgress((sentenceIdx / sentences.length) * 100);
            }, intervalTime);
          }
        },
        onEnd: () => {
          setIsSpeaking(false);
          setCurrentSentence(-1);
          setProgress(100);
          onEnd?.();
        },
        onError: (err) => {
          console.error('[AdvancedTTS] Error:', err);
          setIsSpeaking(false);
          onError?.(err.message || 'Speech synthesis failed');
        }
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      // Check if fallback was used
      if (result.provider === 'web') {
        const baseLang = language.split('-')[0];
        if (!['en', 'hi'].includes(baseLang)) {
          setFallbackLanguage('en');
        }
      } else {
        setFallbackLanguage(null);
      }

      console.log(`[AdvancedTTS] Provider: ${result.provider}, Language: ${language}`);
    } catch (error) {
      console.error('[AdvancedTTS] Error in speak:', error);
      onError?.('Failed to start speech');
      setIsSpeaking(false);
    }
  }, [language, splitIntoSentences, settings.speed, onEnd, onError]);

  const stop = useCallback(() => {
    isStoppedRef.current = true;
    universalTTSService.stop();
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentSentence(-1);
    setProgress(0);
    setFallbackLanguage(null);
    currentIndexRef.current = 0;
  }, []);

  const pause = useCallback(() => {
    if (isSpeaking) {
      // Cloud TTS doesn't support pause, but web speech does
      if ('speechSynthesis' in window) {
        window.speechSynthesis.pause();
        setIsPaused(true);
      }
    }
  }, [isSpeaking]);

  const resume = useCallback(() => {
    if (isPaused && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isPaused]);

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
