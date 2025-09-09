import { useState, useRef } from 'react';

interface UseTextToSpeechProps {
  language?: string;
  rate?: number;
  pitch?: number;
}

export function useTextToSpeech({ 
  language = 'hi-IN', 
  rate = 1.0, 
  pitch = 1.0 
}: UseTextToSpeechProps = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(typeof window !== 'undefined' && 'speechSynthesis' in window);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = (text: string) => {
    if (!isSupported) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = rate;
    utterance.pitch = pitch;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const pause = () => {
    if (isSupported && isSpeaking) {
      window.speechSynthesis.pause();
    }
  };

  const resume = () => {
    if (isSupported && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  };

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isSupported,
  };
}