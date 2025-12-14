/**
 * Advanced Text-to-Speech Hook with Chunked Playback
 * Reads full content naturally by splitting into sentences and playing sequentially
 * Uses Google Cloud TTS / OpenAI TTS (via edge function) with native/web fallbacks
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

// Split text into natural sentences for chunked playback
function splitIntoSentences(text: string): string[] {
  // Clean up markdown and special characters
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]+`/g, '') // Remove inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/#{1,6}\s*/g, '') // Remove headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace links with text
    .replace(/[•\-]\s*/g, '') // Remove bullet points
    .replace(/\n{2,}/g, '. ') // Double newlines to sentence breaks
    .replace(/\n/g, ' ') // Single newlines to spaces
    .trim();

  // Split by sentence-ending punctuation, keeping the punctuation
  const sentenceRegex = /[^.!?।॥]+[.!?।॥]+[\s]*/g;
  const matches = cleanText.match(sentenceRegex) || [];
  
  // If no sentences found, split by length
  if (matches.length === 0 && cleanText.length > 0) {
    // Split long text into chunks of ~200 chars at word boundaries
    const chunks: string[] = [];
    let remaining = cleanText;
    while (remaining.length > 0) {
      if (remaining.length <= 250) {
        chunks.push(remaining.trim());
        break;
      }
      // Find last space before 250 chars
      let splitIndex = remaining.lastIndexOf(' ', 250);
      if (splitIndex === -1) splitIndex = 250;
      chunks.push(remaining.slice(0, splitIndex).trim());
      remaining = remaining.slice(splitIndex).trim();
    }
    return chunks.filter(s => s.length > 0);
  }

  // Combine very short sentences and split very long ones
  const sentences: string[] = [];
  let buffer = '';
  
  for (const match of matches) {
    const sentence = match.trim();
    if (!sentence) continue;
    
    // If buffer + sentence is reasonable length, add to buffer
    if (buffer.length + sentence.length < 300) {
      buffer += (buffer ? ' ' : '') + sentence;
    } else {
      // Push buffer if not empty
      if (buffer) {
        sentences.push(buffer);
      }
      // Start new buffer or push directly if sentence is good length
      if (sentence.length > 400) {
        // Split very long sentence by commas
        const parts = sentence.split(/,\s*/);
        for (const part of parts) {
          if (part.trim()) sentences.push(part.trim());
        }
        buffer = '';
      } else {
        buffer = sentence;
      }
    }
  }
  
  // Don't forget remaining buffer
  if (buffer.trim()) {
    sentences.push(buffer.trim());
  }
  
  return sentences.filter(s => s.length > 0);
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
  const [provider, setProvider] = useState<'google' | 'openai' | 'native' | 'web'>('google');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isStoppedRef = useRef(false);
  const isPausedRef = useRef(false);
  const speakRequestIdRef = useRef(0);
  const sentencesRef = useRef<string[]>([]);
  const currentSentenceIndexRef = useRef(0);
  
  const settings = useTTSStore(state => state.settings);
  const isOnline = useOfflineStatus();

  // Check TTS support
  useEffect(() => {
    const hasWebSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setIsSupported(hasWebSpeech || Capacitor.isNativePlatform());
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isStoppedRef.current = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
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

  // Reset all state
  const resetState = useCallback(() => {
    setIsSpeaking(false);
    setIsLoading(false);
    setIsPaused(false);
    setCurrentSentence(-1);
    setProgress(0);
    setFallbackLanguage(null);
    sentencesRef.current = [];
    currentSentenceIndexRef.current = 0;
  }, []);

  // Stop function
  const stop = useCallback(() => {
    console.log('[AdvancedTTS] Stop called');
    isStoppedRef.current = true;
    isPausedRef.current = false;
    speakRequestIdRef.current++;
    
    // Stop HTML5 Audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
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
      isPausedRef.current = true;
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
      isPausedRef.current = false;
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

  // Speak a single sentence via edge function (Google/OpenAI TTS)
  const speakSentenceWithCloud = useCallback(async (sentence: string, requestId: number): Promise<boolean> => {
    try {
      const langCode = getLanguageCode(language);
      
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { text: sentence, language: langCode }
      });
      
      if (error || !data?.audioContent) {
        console.error('[AdvancedTTS] Cloud TTS error:', error);
        return false;
      }
      
      if (requestId !== speakRequestIdRef.current || isStoppedRef.current) {
        return true; // Cancelled, but not failed
      }
      
      // Create audio element
      const audioBlob = base64ToBlob(data.audioContent, 'audio/mp3');
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Cleanup old audio
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      
      audioRef.current = new Audio(audioUrl);
      audioRef.current.playbackRate = Math.max(0.5, Math.min(2.0, settings.speed || 1.0));
      
      setProvider(data.provider === 'openai' ? 'openai' : 'google');
      
      return new Promise((resolve) => {
        if (!audioRef.current) {
          resolve(false);
          return;
        }
        
        audioRef.current.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve(true);
        };
        
        audioRef.current.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          resolve(false);
        };
        
        // Wait for pause state to clear before playing
        const attemptPlay = () => {
          if (isPausedRef.current) {
            setTimeout(attemptPlay, 100);
            return;
          }
          if (isStoppedRef.current || requestId !== speakRequestIdRef.current) {
            URL.revokeObjectURL(audioUrl);
            resolve(true);
            return;
          }
          audioRef.current?.play().catch(() => {
            URL.revokeObjectURL(audioUrl);
            resolve(false);
          });
        };
        attemptPlay();
      });
    } catch (error) {
      console.error('[AdvancedTTS] Cloud sentence error:', error);
      return false;
    }
  }, [language, settings.speed, getLanguageCode]);

  // Speak a single sentence via Web Speech API
  const speakSentenceWithWebSpeech = useCallback(async (sentence: string, requestId: number): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return false;
    }
    
    const synth = window.speechSynthesis;
    
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
      const langCode = getLanguageCode(language);
      utterance.lang = langCode;
      utterance.rate = Math.max(0.5, Math.min(2.0, settings.speed || 1.0));
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      // Try to find a good voice
      const voices = synth.getVoices();
      const baseLang = language.split('-')[0].toLowerCase();
      const matchingVoice = voices.find(v => v.lang.toLowerCase().startsWith(baseLang));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      
      utterance.onend = () => resolve(true);
      utterance.onerror = (e) => {
        if (e.error === 'canceled' || e.error === 'interrupted') {
          resolve(true);
        } else {
          resolve(false);
        }
      };
      
      // Wait for pause state to clear before speaking
      const attemptSpeak = () => {
        if (isPausedRef.current) {
          setTimeout(attemptSpeak, 100);
          return;
        }
        if (isStoppedRef.current || requestId !== speakRequestIdRef.current) {
          resolve(true);
          return;
        }
        synth.speak(utterance);
      };
      attemptSpeak();
    });
  }, [language, settings.speed, getLanguageCode]);

  // Speak a single sentence via Capacitor Native TTS
  const speakSentenceWithNative = useCallback(async (sentence: string, requestId: number): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }
    
    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      const langCode = getLanguageCode(language);
      
      // Wait for pause state to clear
      while (isPausedRef.current) {
        await new Promise(r => setTimeout(r, 100));
        if (isStoppedRef.current || requestId !== speakRequestIdRef.current) {
          return true;
        }
      }
      
      if (isStoppedRef.current || requestId !== speakRequestIdRef.current) {
        return true;
      }
      
      await TextToSpeech.speak({
        text: sentence.trim(),
        lang: langCode,
        rate: Math.max(0.5, Math.min(2.0, settings.speed || 1.0)),
        pitch: 1.0,
        volume: 1.0,
        category: 'ambient',
      });
      
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.toLowerCase().includes('interrupt') || errorMsg.toLowerCase().includes('cancel')) {
        return true;
      }
      console.error('[AdvancedTTS] Native sentence error:', errorMsg);
      return false;
    }
  }, [language, settings.speed, getLanguageCode]);

  // Main speak function with chunked playback - reads until stopped
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    // Reset state
    isStoppedRef.current = false;
    isPausedRef.current = false;
    const requestId = ++speakRequestIdRef.current;
    
    // Split text into sentences
    const sentences = splitIntoSentences(text);
    sentencesRef.current = sentences;
    currentSentenceIndexRef.current = 0;
    
    console.log(`[AdvancedTTS] Starting: ${sentences.length} sentences, lang=${language}, online=${isOnline}`);
    
    try {
      setProgress(0);
      setCurrentSentence(0);
      setFallbackLanguage(null);
      setIsLoading(true);
      setIsSpeaking(false);
      setIsPaused(false);
      
      // Determine TTS method
      const useCloud = isOnline && !Capacitor.isNativePlatform();
      const useNative = Capacitor.isNativePlatform();
      
      let speakSentence: (s: string, id: number) => Promise<boolean>;
      
      if (useCloud) {
        speakSentence = speakSentenceWithCloud;
        console.log('[AdvancedTTS] Using Cloud TTS (Google/OpenAI)');
      } else if (useNative) {
        speakSentence = speakSentenceWithNative;
        setProvider('native');
        setFallbackLanguage('native');
        console.log('[AdvancedTTS] Using Native TTS');
      } else {
        speakSentence = speakSentenceWithWebSpeech;
        setProvider('web');
        setFallbackLanguage('web');
        console.log('[AdvancedTTS] Using Web Speech API');
      }
      
      // Play sentences sequentially
      for (let i = 0; i < sentences.length; i++) {
        // Check if stopped
        if (isStoppedRef.current || requestId !== speakRequestIdRef.current) {
          console.log('[AdvancedTTS] Playback stopped by user');
          break;
        }
        
        const sentence = sentences[i];
        currentSentenceIndexRef.current = i;
        setCurrentSentence(i);
        setProgress(Math.round((i / sentences.length) * 100));
        
        if (i === 0) {
          setIsLoading(false);
          setIsSpeaking(true);
        }
        
        console.log(`[AdvancedTTS] Playing sentence ${i + 1}/${sentences.length}: "${sentence.slice(0, 50)}..."`);
        
        const success = await speakSentence(sentence, requestId);
        
        if (!success) {
          // Try fallback if cloud fails
          if (useCloud) {
            console.log('[AdvancedTTS] Cloud failed, trying Web Speech fallback');
            setFallbackLanguage('web');
            setProvider('web');
            const webSuccess = await speakSentenceWithWebSpeech(sentence, requestId);
            if (!webSuccess) {
              console.error('[AdvancedTTS] All TTS methods failed for sentence');
            }
          }
        }
        
        // Small pause between sentences for natural flow
        if (!isStoppedRef.current && i < sentences.length - 1) {
          await new Promise(r => setTimeout(r, 150));
        }
      }
      
      // Complete
      if (requestId === speakRequestIdRef.current && !isStoppedRef.current) {
        setProgress(100);
        setIsSpeaking(false);
        setCurrentSentence(-1);
        onEnd?.();
        console.log('[AdvancedTTS] Playback complete');
      }
      
    } catch (error) {
      if (requestId === speakRequestIdRef.current) {
        console.error('[AdvancedTTS] Error:', error);
        onError?.('Failed to start speech');
        resetState();
      }
    }
  }, [language, isOnline, speakSentenceWithCloud, speakSentenceWithNative, speakSentenceWithWebSpeech, resetState, onEnd, onError]);

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
    sentences: sentencesRef.current
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
