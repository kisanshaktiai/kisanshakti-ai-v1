/**
 * Text-to-Speech Hook
 * Used by the schedule, land, NDVI and onboarding screens.
 *
 * Native (Capacitor) runs on the device speech engine through nativeTTSService.
 * Browser/PWA runs on the Web Speech API, preferring voices the browser reports
 * as local. Nothing is sent to a cloud speech service.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { nativeTTSService } from '@/services/nativeTTSService';
import { prepareForSpeech } from '@/services/tts/ttsTextPrepare';

// Web Speech API synthesis
let synth: SpeechSynthesis | null = null;
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  synth = window.speechSynthesis;
}

/** How long to wait for the browser to populate its voice list before speaking. */
const VOICES_READY_TIMEOUT_MS = 1500;

interface UseTextToSpeechProps {
  language?: string;
  rate?: number;
  pitch?: number;
  onError?: (error: string) => void;
}

function baseOf(tag: string): string {
  return (tag || '').split('-')[0].toLowerCase();
}

export function useTextToSpeech({
  language = 'hi',
  rate = 0.9,
  pitch = 1.0,
  onError,
}: UseTextToSpeechProps = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [isVoicesLoaded, setIsVoicesLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speakingRef = useRef(false);
  const requestIdRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check TTS support
  useEffect(() => {
    const hasWebSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setIsSupported(hasWebSpeech || Capacitor.isNativePlatform());
  }, []);

  // Load voices
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let cancelled = false;
      nativeTTSService.ensureInitialized().then(() => {
        if (!cancelled) setIsVoicesLoaded(nativeTTSService.getDeviceLanguages().length > 0);
      });
      return () => {
        cancelled = true;
      };
    }

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
    const baseLang = baseOf(lang);
    const langCodes: Record<string, string> = {
      'hi': 'hi-IN', 'mr': 'mr-IN', 'ta': 'ta-IN', 'te': 'te-IN',
      'bn': 'bn-IN', 'gu': 'gu-IN', 'kn': 'kn-IN', 'ml': 'ml-IN',
      'pa': 'pa-IN', 'en': 'en-IN',
    };
    return langCodes[baseLang] || `${baseLang}-IN`;
  }, []);

  /** Resolve once the browser has voices, or after a short timeout. */
  const waitForVoices = useCallback((): Promise<SpeechSynthesisVoice[]> => {
    return new Promise((resolve) => {
      if (!synth) {
        resolve([]);
        return;
      }

      const existing = synth.getVoices();
      if (existing.length > 0) {
        resolve(existing);
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(synth ? synth.getVoices() : []);
      };

      synth.onvoiceschanged = finish;
      setTimeout(finish, VOICES_READY_TIMEOUT_MS);
    });
  }, []);

  /**
   * Pick the best voice for a language.
   * On-device voices win. A non-local voice is a network voice, which would
   * both cost money and send the farmer's text off the handset, so it is only
   * used when the device has nothing local for that language.
   */
  const pickVoice = useCallback(
    (voices: SpeechSynthesisVoice[], langCode: string): SpeechSynthesisVoice | null => {
      const base = baseOf(langCode);
      const matching = voices.filter((v) => baseOf(v.lang) === base);

      if (matching.length > 0) {
        const exact = matching.filter((v) => v.lang.toLowerCase() === langCode.toLowerCase());
        const pool = exact.length > 0 ? exact : matching;
        const local = pool.filter((v) => v.localService);
        return local[0] || pool[0];
      }

      return null;
    },
    []
  );

  const speak = useCallback(
    async (text: string) => {
      if (!text?.trim()) return;

      const requestId = ++requestIdRef.current;
      const langCode = getLanguageCode(language);

      try {
        setError(null);
        setIsSpeaking(true);
        speakingRef.current = true;

        // Native device engine first. It is the only path that works offline
        // inside the APK and it handles chunking and voice resolution itself.
        if (Capacitor.isNativePlatform()) {
          const result = await nativeTTSService.speak(
            text,
            language,
            {
              rate: Math.max(0.5, Math.min(2.0, rate)),
              pitch: Math.max(0.5, Math.min(2.0, pitch)),
              volume: 1.0,
            },
            {}
          );

          if (requestId !== requestIdRef.current) return;

          if (!result.success) {
            const msg = result.voiceUnavailable ? 'voice-unavailable' : result.error || 'tts-failed';
            setError(msg);
            onError?.(msg);
          }

          setIsSpeaking(false);
          speakingRef.current = false;
          return;
        }

        if (!synth) {
          const msg = 'Speech synthesis not available';
          setError(msg);
          onError?.(msg);
          setIsSpeaking(false);
          speakingRef.current = false;
          return;
        }

        synth.cancel();

        const voices = await waitForVoices();
        if (requestId !== requestIdRef.current) return;

        const voice = pickVoice(voices, langCode);

        if (!voice) {
          const msg = 'voice-unavailable';
          setError(msg);
          onError?.(msg);
          setIsSpeaking(false);
          speakingRef.current = false;
          return;
        }

        // Chunk so no single utterance is long enough to be cut off.
        const { chunks } = prepareForSpeech(text);

        for (let i = 0; i < chunks.length; i++) {
          if (requestId !== requestIdRef.current) return;

          const finished = await new Promise<boolean>((resolve) => {
            const utterance = new SpeechSynthesisUtterance(chunks[i]);
            utterance.lang = voice.lang || langCode;
            utterance.voice = voice;
            utterance.rate = Math.max(0.5, Math.min(2.0, rate));
            utterance.pitch = Math.max(0.5, Math.min(2.0, pitch));
            utterance.volume = 1.0;

            utterance.onend = () => resolve(true);
            utterance.onerror = (event) => {
              const err = (event as SpeechSynthesisErrorEvent).error;
              resolve(err === 'canceled' || err === 'interrupted');
            };

            utteranceRef.current = utterance;
            synth!.speak(utterance);
          });

          if (!finished) {
            const msg = 'Speech synthesis failed';
            setError(msg);
            onError?.(msg);
            break;
          }
        }

        if (requestId === requestIdRef.current) {
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
    },
    [language, rate, pitch, onError, getLanguageCode, waitForVoices, pickVoice]
  );

  const stop = useCallback(() => {
    try {
      requestIdRef.current++;

      if (synth) synth.cancel();

      if (Capacitor.isNativePlatform()) {
        nativeTTSService.stop();
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
    if (synth && speakingRef.current && !Capacitor.isNativePlatform()) {
      synth.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (synth && !Capacitor.isNativePlatform()) {
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
