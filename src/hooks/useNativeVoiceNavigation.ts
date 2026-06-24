/**
 * Native Voice Navigation Hook
 * Unified hook for native-first speech recognition with hybrid intent matching
 * <100ms response time for common commands
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useLanguageStore } from '@/stores/languageStore';
import { nativeSpeechRecognition, SpeechRecognitionResult } from '@/services/voice/nativeSpeechRecognition';
import { hybridIntentMatcher, MatchedIntent } from '@/services/voice/hybridIntentMatcher';
import { useTTS } from '@/hooks/useTTS';

export interface VoiceNavigationState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  transcript: string;
  partialTranscript: string;
  confidence: number;
  lastIntent: MatchedIntent | null;
  error: string | null;
  isSupported: boolean;
  provider: 'native' | 'web' | null;
  totalLatencyMs: number;
}

export interface UseNativeVoiceNavigationReturn extends VoiceNavigationState {
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  toggleListening: () => Promise<void>;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  clearError: () => void;
  getExamples: () => string[];
}

// Debounce settings
const PROCESSING_DEBOUNCE_MS = 300;
const MIN_TRANSCRIPT_LENGTH = 2;

export function useNativeVoiceNavigation(): UseNativeVoiceNavigationReturn {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentLanguage } = useLanguageStore();
  const { speak: ttsSpeak, stop: ttsStop, isSpeaking } = useTTS();

  const [state, setState] = useState<VoiceNavigationState>({
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    transcript: '',
    partialTranscript: '',
    confidence: 0,
    lastIntent: null,
    error: null,
    isSupported: false,
    provider: null,
    totalLatencyMs: 0,
  });

  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedRef = useRef<string>('');
  const startTimeRef = useRef<number>(0);

  // Initialize speech recognition
  useEffect(() => {
    const init = async () => {
      const supported = nativeSpeechRecognition.isSupported();
      setState(prev => ({ ...prev, isSupported: supported }));
      
      if (supported) {
        await nativeSpeechRecognition.initialize();
      }
    };
    init();

    // Update language in intent matcher
    hybridIntentMatcher.setLanguage(currentLanguage);
  }, [currentLanguage]);

  // Process transcript and match intent
  const processTranscript = useCallback(async (transcript: string, confidence: number) => {
    // Skip if too short or same as last processed
    if (transcript.length < MIN_TRANSCRIPT_LENGTH || transcript === lastProcessedRef.current) {
      return;
    }

    lastProcessedRef.current = transcript;
    setState(prev => ({ ...prev, isProcessing: true, transcript }));

    try {
      const intent = await hybridIntentMatcher.matchIntent(transcript);
      
      if (intent) {
        const totalLatency = performance.now() - startTimeRef.current;
        
        setState(prev => ({
          ...prev,
          lastIntent: intent,
          totalLatencyMs: totalLatency,
          isProcessing: false,
        }));

        // Stop listening before executing action
        await nativeSpeechRecognition.stopListening();
        setState(prev => ({ ...prev, isListening: false }));

        // Announce action
        if (intent.announcement) {
          await ttsSpeak(intent.announcement);
        }

        // Execute action
        if (intent.action === 'navigate' && intent.route) {
          navigate(intent.route);
          toast({
            title: 'Voice Command',
            description: `Navigated via ${intent.provider} (${totalLatency.toFixed(0)}ms)`,
          });
        } else if (intent.action === 'back') {
          navigate(-1);
        }

        console.log(`[VoiceNav] Intent executed: ${intent.intentId} in ${totalLatency.toFixed(0)}ms`);
      } else {
        setState(prev => ({ ...prev, isProcessing: false }));
        
        // No match found
        if (confidence > 0.5) {
          toast({
            title: 'Command not recognized',
            description: 'Try: "weather", "lands", "schedule"',
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      console.error('[VoiceNav] Processing error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: 'Failed to process command',
      }));
    }
  }, [navigate, toast, ttsSpeak]);

  // Handle speech recognition results
  const handleResult = useCallback((result: SpeechRecognitionResult) => {
    setState(prev => ({
      ...prev,
      partialTranscript: result.transcript,
      confidence: result.confidence,
      provider: result.provider,
    }));

    if (result.isFinal) {
      // Clear any pending processing
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }

      // Process immediately for final results
      processTranscript(result.transcript, result.confidence);
    } else {
      // Debounce processing for partial results
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      
      processingTimeoutRef.current = setTimeout(() => {
        if (result.confidence > 0.7) {
          processTranscript(result.transcript, result.confidence);
        }
      }, PROCESSING_DEBOUNCE_MS);
    }
  }, [processTranscript]);

  // Handle recognition end
  const handleEnd = useCallback(() => {
    setState(prev => ({ ...prev, isListening: false }));
  }, []);

  // Handle recognition error
  const handleError = useCallback((error: string) => {
    console.error('[VoiceNav] Recognition error:', error);
    setState(prev => ({
      ...prev,
      isListening: false,
      error: error === 'not-allowed' 
        ? 'Microphone permission denied' 
        : 'Recognition failed, please try again',
    }));

    if (error === 'not-allowed') {
      toast({
        title: 'Microphone Access',
        description: 'Please allow microphone access for voice commands',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Start listening
  const startListening = useCallback(async () => {
    if (state.isListening) return;

    // Check permission first
    const permission = await nativeSpeechRecognition.checkPermission();
    if (permission === 'denied') {
      setState(prev => ({ ...prev, error: 'Microphone permission denied' }));
      toast({
        title: 'Permission Required',
        description: 'Please enable microphone in settings',
        variant: 'destructive',
      });
      return;
    }

    if (permission === 'prompt') {
      const granted = await nativeSpeechRecognition.requestPermission();
      if (!granted) {
        setState(prev => ({ ...prev, error: 'Microphone permission denied' }));
        return;
      }
    }

    // Clear previous state
    setState(prev => ({
      ...prev,
      transcript: '',
      partialTranscript: '',
      error: null,
      lastIntent: null,
    }));
    lastProcessedRef.current = '';
    startTimeRef.current = performance.now();

    // Stop any ongoing TTS
    ttsStop();

    // Start recognition
    const started = await nativeSpeechRecognition.startListening(
      {
        language: currentLanguage,
        continuous: false,
        interimResults: true,
      },
      handleResult,
      handleEnd,
      handleError
    );

    if (started) {
      setState(prev => ({ ...prev, isListening: true }));
    }
  }, [state.isListening, currentLanguage, handleResult, handleEnd, handleError, ttsStop, toast]);

  // Stop listening
  const stopListening = useCallback(async () => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    await nativeSpeechRecognition.stopListening();
    setState(prev => ({ ...prev, isListening: false }));
  }, []);

  // Toggle listening
  const toggleListening = useCallback(async () => {
    if (state.isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [state.isListening, startListening, stopListening]);

  // Speak text
  const speak = useCallback(async (text: string) => {
    await ttsSpeak(text);
  }, [ttsSpeak]);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    ttsStop();
  }, [ttsStop]);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Get examples
  const getExamples = useCallback(() => {
    return hybridIntentMatcher.getExamples();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      nativeSpeechRecognition.stopListening();
    };
  }, []);

  return {
    ...state,
    isSpeaking,
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopSpeaking,
    clearError,
    getExamples,
  };
}

export default useNativeVoiceNavigation;
