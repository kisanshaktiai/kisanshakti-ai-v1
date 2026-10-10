/**
 * useSpeechRecognition — the chat mic.
 *
 * Runs on nativeSpeechRecognition, the one STT service (Capacitor plugin on
 * Android/iOS, Web Speech API in the browser), so the chat mic and voice
 * navigation share a single engine. The previous version used
 * window.webkitSpeechRecognition only, which the Android WebView and iOS
 * WKWebView do not provide, so the mic was dead in the installed app.
 *
 * `language` is the app language ('mr', 'kn', ...) or a locale; the service
 * resolves it through the language SSOT. Nothing here defaults to another
 * language.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { nativeSpeechRecognition } from '@/services/voice/nativeSpeechRecognition';
import type { SpeechRecognitionResult } from '@/services/voice/nativeSpeechRecognition';

interface UseSpeechRecognitionProps {
  onTranscript: (transcript: string, confidence?: number) => void;
  onPartial?: (transcript: string) => void;
  language?: string;
}

export function useSpeechRecognition({ onTranscript, onPartial, language = 'hi' }: UseSpeechRecognitionProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  // Latest callbacks without re-binding the recogniser on every render.
  const callbacksRef = useRef({ onTranscript, onPartial });
  callbacksRef.current = { onTranscript, onPartial };

  useEffect(() => {
    let alive = true;
    nativeSpeechRecognition.initialize().then((ok) => {
      if (alive) setIsSupported(ok && nativeSpeechRecognition.isSupported());
    });
    return () => {
      alive = false;
      if (nativeSpeechRecognition.getIsListening()) {
        nativeSpeechRecognition.stopListening();
      }
    };
  }, []);

  const handleResult = useCallback((result: SpeechRecognitionResult) => {
    if (result.isFinal) {
      callbacksRef.current.onTranscript(result.transcript, result.confidence);
    } else {
      callbacksRef.current.onPartial?.(result.transcript);
    }
  }, []);

  const startListening = useCallback(async () => {
    if (isListening || nativeSpeechRecognition.getIsListening()) return;

    const granted = await nativeSpeechRecognition.requestPermission();
    if (!granted) {
      console.warn('[SpeechRecognition] Microphone permission not granted');
      return;
    }

    const started = await nativeSpeechRecognition.startListening(
      { language, continuous: false, interimResults: true },
      handleResult,
      () => setIsListening(false),
      (error) => {
        console.error('[SpeechRecognition] error:', error);
        setIsListening(false);
      }
    );
    setIsListening(started);
  }, [isListening, language, handleResult]);

  const stopListening = useCallback(() => {
    nativeSpeechRecognition.stopListening();
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else void startListening();
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
  };
}
