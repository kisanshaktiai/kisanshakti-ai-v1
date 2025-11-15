import { useState, useRef, useEffect, useCallback } from 'react';

interface UseTextToSpeechProps {
  language?: string;
  rate?: number;
  pitch?: number;
  onError?: (error: string) => void;
}

export function useTextToSpeech({ 
  language = 'hi-IN', 
  rate = 0.9, 
  pitch = 1.0,
  onError
}: UseTextToSpeechProps = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isVoicesLoaded, setIsVoicesLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesLoadedRef = useRef(false);

  // Check support and load voices
  useEffect(() => {
    const checkSupport = () => {
      const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
      setIsSupported(supported);
      
      if (supported) {
        // Load voices
        const loadVoices = () => {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0 && !voicesLoadedRef.current) {
            voicesLoadedRef.current = true;
            setIsVoicesLoaded(true);
          }
        };

        // Try to load voices immediately
        loadVoices();

        // Listen for voices changed event (some browsers load voices async)
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = loadVoices;
        }

        // Fallback: Set loaded after a short delay
        const timeout = setTimeout(() => {
          if (!voicesLoadedRef.current) {
            voicesLoadedRef.current = true;
            setIsVoicesLoaded(true);
          }
        }, 500);

        return () => {
          clearTimeout(timeout);
          if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = null;
          }
        };
      }
    };

    checkSupport();
  }, []);

  const getVoiceForLanguage = useCallback((lang: string) => {
    if (!isSupported) return null;
    
    const voices = window.speechSynthesis.getVoices();
    
    // Try to find a voice for the specified language
    let voice = voices.find(v => v.lang.startsWith(lang.split('-')[0]));
    
    // Fallback to English if language not found
    if (!voice) {
      voice = voices.find(v => v.lang.startsWith('en'));
    }
    
    // Fallback to any voice
    if (!voice && voices.length > 0) {
      voice = voices[0];
    }
    
    return voice;
  }, [isSupported]);

  const speak = useCallback((text: string) => {
    if (!isSupported) {
      const errorMsg = 'Text-to-speech is not supported in this browser';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    if (!text.trim()) {
      return;
    }

    try {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      setError(null);

      const utterance = new SpeechSynthesisUtterance(text);
      
      // Set language and voice
      utterance.lang = language;
      const voice = getVoiceForLanguage(language);
      if (voice) {
        utterance.voice = voice;
      }
      
      utterance.rate = rate;
      utterance.pitch = pitch;

      utterance.onstart = () => {
        setIsSpeaking(true);
        setError(null);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
      };

      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setIsSpeaking(false);
        
        let errorMsg = 'Failed to play speech';
        
        if (event.error === 'not-allowed') {
          errorMsg = 'Microphone/audio access denied. Please enable in settings.';
        } else if (event.error === 'network') {
          errorMsg = 'Network error. Please check your connection.';
        } else if (event.error === 'synthesis-failed') {
          errorMsg = 'Speech synthesis failed. Language may not be supported.';
        }
        
        setError(errorMsg);
        onError?.(errorMsg);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('Error in speak function:', err);
      const errorMsg = 'An error occurred while trying to speak';
      setError(errorMsg);
      onError?.(errorMsg);
      setIsSpeaking(false);
    }
  }, [isSupported, language, rate, pitch, getVoiceForLanguage, onError]);

  const stop = useCallback(() => {
    if (isSupported) {
      try {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setError(null);
      } catch (err) {
        console.error('Error stopping speech:', err);
      }
    }
  }, [isSupported]);

  const pause = useCallback(() => {
    if (isSupported && isSpeaking) {
      try {
        window.speechSynthesis.pause();
      } catch (err) {
        console.error('Error pausing speech:', err);
      }
    }
  }, [isSupported, isSpeaking]);

  const resume = useCallback(() => {
    if (isSupported && window.speechSynthesis.paused) {
      try {
        window.speechSynthesis.resume();
      } catch (err) {
        console.error('Error resuming speech:', err);
      }
    }
  }, [isSupported]);

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