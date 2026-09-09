/**
 * Advanced Text-to-Speech Hook with Chunked Playback
 * Reads the full displayed response by splitting it into chunks and playing
 * them in order.
 *
 * On-device only:
 *  - Native (Capacitor Android/iOS): the system speech engine via
 *    nativeTTSService. Works with no network once the voice data is installed.
 *  - Browser/PWA: the Web Speech API, preferring voices the browser reports as
 *    local (localService === true).
 *
 * The farmer's response text is never sent to a cloud speech service, so Read
 * Aloud has no per-use cost and works with the handset offline.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useTTSStore } from '@/stores/ttsStore';
import { nativeTTSService } from '@/services/nativeTTSService';
import { prepareForSpeech } from '@/services/tts/ttsTextPrepare';

interface UseAdvancedTextToSpeechProps {
  language: string;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export type TTSEngine = 'native' | 'web' | 'none';

/** How long to wait for the browser to populate its voice list before speaking. */
const VOICES_READY_TIMEOUT_MS = 1500;

/** Gap between chunks so the reading sounds like sentences, not one long run. */
const INTER_CHUNK_PAUSE_MS = 150;

/** Base language of a BCP-47 tag. */
function baseOf(tag: string): string {
  return (tag || '').split('-')[0].toLowerCase();
}

/**
 * Map an app language to a BCP-47 tag for the speech engine.
 * India-region tags are the default because every UI language the app ships is
 * an Indian language; anything unmapped keeps its own base tag.
 */
function toBcp47(lang: string): string {
  const base = baseOf(lang);
  const info = nativeTTSService.getLanguageInfo(base);
  if (info) {
    const catalogue = nativeTTSService
      .getSupportedLanguages()
      .find((l) => baseOf(l.code) === base);
    if (catalogue) return catalogue.code;
  }
  return base ? `${base}-IN` : 'en-IN';
}

/** Resolve once the browser has voices, or after a short timeout. */
function waitForWebVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve([]);
      return;
    }

    const synth = window.speechSynthesis;
    const existing = synth.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.onvoiceschanged = null;
      resolve(synth.getVoices());
    };

    synth.onvoiceschanged = finish;
    setTimeout(finish, VOICES_READY_TIMEOUT_MS);
  });
}

export function useAdvancedTextToSpeech({
  language,
  onEnd,
  onError,
}: UseAdvancedTextToSpeechProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [currentSentence, setCurrentSentence] = useState<number>(-1);
  const [progress, setProgress] = useState(0);
  /** BCP-47 tag actually used when it differs from the requested language, else null. */
  const [fallbackLanguage, setFallbackLanguage] = useState<string | null>(null);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [engine, setEngine] = useState<TTSEngine>('none');

  const isStoppedRef = useRef(false);
  const isPausedRef = useRef(false);
  const speakRequestIdRef = useRef(0);
  const chunksRef = useRef<string[]>([]);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const settings = useTTSStore((state) => state.settings);

  // Check TTS support
  useEffect(() => {
    const hasWebSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setIsSupported(hasWebSpeech || Capacitor.isNativePlatform());
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isStoppedRef.current = true;
      speakRequestIdRef.current++;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (Capacitor.isNativePlatform()) {
        nativeTTSService.stop();
      }
    };
  }, []);

  const resetState = useCallback(() => {
    setIsSpeaking(false);
    setIsLoading(false);
    setIsPaused(false);
    setCurrentSentence(-1);
    setProgress(0);
    chunksRef.current = [];
    currentUtteranceRef.current = null;
  }, []);

  const stop = useCallback(() => {
    console.log('[AdvancedTTS] Stop called');
    isStoppedRef.current = true;
    isPausedRef.current = false;
    speakRequestIdRef.current++;

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (Capacitor.isNativePlatform()) {
      nativeTTSService.stop();
    }

    resetState();
  }, [resetState]);

  /**
   * Pause takes effect at the next chunk boundary. The Android speech engine
   * has no pause, so on native the current chunk finishes first.
   */
  const pause = useCallback(() => {
    if (!isSpeaking || isPaused) return;

    isPausedRef.current = true;

    if (!Capacitor.isNativePlatform() && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.pause();
    }

    setIsPaused(true);
  }, [isSpeaking, isPaused]);

  const resume = useCallback(() => {
    if (!isPaused) return;

    isPausedRef.current = false;

    if (!Capacitor.isNativePlatform() && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.resume();
    }

    setIsPaused(false);
  }, [isPaused]);

  /** Block while paused. Returns false when playback was stopped meanwhile. */
  const waitWhilePaused = useCallback(async (requestId: number): Promise<boolean> => {
    while (isPausedRef.current) {
      await new Promise((r) => setTimeout(r, 100));
      if (isStoppedRef.current || requestId !== speakRequestIdRef.current) return false;
    }
    return !(isStoppedRef.current || requestId !== speakRequestIdRef.current);
  }, []);

  /** Speak one chunk through the device engine. */
  const speakChunkNative = useCallback(
    async (chunk: string): Promise<{ ok: boolean; voiceUnavailable?: boolean; used?: string }> => {
      const result = await nativeTTSService.speak(
        chunk,
        language,
        {
          rate: Math.max(0.5, Math.min(2.0, settings.speed || 1.0)),
          pitch: 1.0,
          volume: 1.0,
        },
        {}
      );

      return {
        ok: result.success,
        voiceUnavailable: result.voiceUnavailable,
        used: result.usedLanguage,
      };
    },
    [language, settings.speed]
  );

  /** Speak one chunk through the Web Speech API. */
  const speakChunkWeb = useCallback(
    async (chunk: string, voice: SpeechSynthesisVoice | null, langTag: string): Promise<boolean> => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return false;

      const synth = window.speechSynthesis;

      return new Promise<boolean>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = voice?.lang || langTag;
        utterance.rate = Math.max(0.5, Math.min(2.0, settings.speed || 1.0));
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        if (voice) utterance.voice = voice;

        utterance.onend = () => resolve(true);
        utterance.onerror = (e) => {
          const err = (e as SpeechSynthesisErrorEvent).error;
          resolve(err === 'canceled' || err === 'interrupted');
        };

        currentUtteranceRef.current = utterance;
        synth.speak(utterance);
      });
    },
    [settings.speed]
  );

  /**
   * Read the given text end to end.
   * The text passed in is the full response as displayed to the farmer.
   */
  const speak = useCallback(
    async (text: string) => {
      if (!text?.trim()) return;

      isStoppedRef.current = false;
      isPausedRef.current = false;
      const requestId = ++speakRequestIdRef.current;

      const { chunks } = prepareForSpeech(text);
      chunksRef.current = chunks;

      if (chunks.length === 0) {
        console.warn('[AdvancedTTS] Nothing speakable in message');
        return;
      }

      setProgress(0);
      setCurrentSentence(0);
      setFallbackLanguage(null);
      setVoiceUnavailable(false);
      setIsLoading(true);
      setIsSpeaking(false);
      setIsPaused(false);

      const isNative = Capacitor.isNativePlatform();
      const requestedTag = toBcp47(language);
      let webVoice: SpeechSynthesisVoice | null = null;

      try {
        if (isNative) {
          setEngine('native');

          await nativeTTSService.ensureInitialized();
          const resolution = nativeTTSService.getLanguageCode(language);

          if (!resolution.available) {
            setVoiceUnavailable(true);
            setIsLoading(false);
            resetState();
            onError?.('voice-unavailable');
            return;
          }

          if (resolution.isFallback) setFallbackLanguage(resolution.code);
        } else {
          setEngine('web');

          const voices = await waitForWebVoices();
          const base = baseOf(requestedTag);

          const matching = voices.filter((v) => baseOf(v.lang) === base);
          // Prefer a voice the browser reports as on-device. A non-local voice
          // is a network voice, which would both cost and leak the text.
          const local = matching.filter((v) => v.localService);
          webVoice = local[0] || matching[0] || null;

          if (!webVoice) {
            setVoiceUnavailable(true);
            setIsLoading(false);
            resetState();
            onError?.('voice-unavailable');
            return;
          }

          if (baseOf(webVoice.lang) !== base) setFallbackLanguage(webVoice.lang);
        }

        console.log('[AdvancedTTS] Starting:', {
          chunks: chunks.length,
          language,
          engine: isNative ? 'native' : 'web',
          voice: webVoice?.name,
        });

        for (let i = 0; i < chunks.length; i++) {
          if (isStoppedRef.current || requestId !== speakRequestIdRef.current) {
            console.log('[AdvancedTTS] Playback stopped');
            return;
          }

          const canContinue = await waitWhilePaused(requestId);
          if (!canContinue) return;

          setCurrentSentence(i);
          setProgress(Math.round((i / chunks.length) * 100));

          if (i === 0) {
            setIsLoading(false);
            setIsSpeaking(true);
          }

          if (isNative) {
            const result = await speakChunkNative(chunks[i]);

            if (result.voiceUnavailable) {
              setVoiceUnavailable(true);
              onError?.('voice-unavailable');
              resetState();
              return;
            }

            if (!result.ok) {
              console.error('[AdvancedTTS] Device engine failed on chunk', i);
              onError?.('tts-failed');
              resetState();
              return;
            }
          } else {
            const ok = await speakChunkWeb(chunks[i], webVoice, requestedTag);
            if (!ok) {
              console.error('[AdvancedTTS] Web Speech failed on chunk', i);
              onError?.('tts-failed');
              resetState();
              return;
            }
          }

          if (!isStoppedRef.current && i < chunks.length - 1) {
            await new Promise((r) => setTimeout(r, INTER_CHUNK_PAUSE_MS));
          }
        }

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
          onError?.(error instanceof Error ? error.message : 'tts-failed');
          resetState();
        }
      }
    },
    [language, onEnd, onError, resetState, speakChunkNative, speakChunkWeb, waitWhilePaused]
  );

  /** Open the system voice-data screen so the farmer can install the missing voice. */
  const openVoiceInstall = useCallback(async () => {
    const opened = await nativeTTSService.openVoiceInstall();
    if (opened) {
      // Pick up a newly installed voice without needing an app restart.
      await nativeTTSService.refreshDeviceLanguages();
      setVoiceUnavailable(false);
    }
    return opened;
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
    voiceUnavailable,
    openVoiceInstall,
    canInstallVoice: Capacitor.isNativePlatform(),
    engine,
    provider: engine,
    sentences: chunksRef.current,
  };
}
