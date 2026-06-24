/**
 * Native Speech Recognition Service
 * Uses Capacitor native speech recognition for offline-first, instant response
 * Falls back to Web Speech API when native is unavailable
 */

import { Capacitor } from '@capacitor/core';

// Dynamic import to prevent build errors
let SpeechRecognitionPlugin: any = null;

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  provider: 'native' | 'web';
  latencyMs: number;
}

export interface NativeSpeechConfig {
  language: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
}

// Language code mapping for native platforms
const LANGUAGE_MAP: Record<string, string> = {
  'en': 'en-IN',
  'hi': 'hi-IN',
  'mr': 'mr-IN',
  'pa': 'pa-IN',
  'ta': 'ta-IN',
  'te': 'te-IN',
  'bn': 'bn-IN',
  'gu': 'gu-IN',
  'kn': 'kn-IN',
};

class NativeSpeechRecognitionService {
  private isInitialized = false;
  private isListening = false;
  private webRecognition: any = null;
  private startTime = 0;
  private currentLanguage = 'en-IN';
  private onResultCallback: ((result: SpeechRecognitionResult) => void) | null = null;
  private onEndCallback: (() => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;

  /**
   * Initialize the speech recognition service
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    // Try to load Capacitor plugin for native platforms
    if (Capacitor.isNativePlatform()) {
      try {
        const module = await import('@capacitor-community/speech-recognition');
        SpeechRecognitionPlugin = module.SpeechRecognition;
        
        // Check availability
        const { available } = await SpeechRecognitionPlugin.available();
        if (available) {
          console.log('[NativeSpeech] Capacitor plugin initialized successfully');
          this.isInitialized = true;
          return true;
        }
      } catch (error) {
        console.warn('[NativeSpeech] Capacitor plugin not available:', error);
      }
    }

    // Fall back to Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.webRecognition = new SpeechRecognition();
      console.log('[NativeSpeech] Web Speech API initialized as fallback');
      this.isInitialized = true;
      return true;
    }

    console.error('[NativeSpeech] No speech recognition available');
    return false;
  }

  /**
   * Check if speech recognition is supported
   */
  isSupported(): boolean {
    if (Capacitor.isNativePlatform()) {
      return true; // Assume supported on native platforms
    }
    return !!(
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition
    );
  }

  /**
   * Request microphone permission
   */
  async requestPermission(): Promise<boolean> {
    if (Capacitor.isNativePlatform() && SpeechRecognitionPlugin) {
      try {
        const result = await SpeechRecognitionPlugin.requestPermissions();
        return result.speechRecognition === 'granted';
      } catch (error) {
        console.error('[NativeSpeech] Permission request failed:', error);
        return false;
      }
    }

    // Web browser - permission requested when starting recognition
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check permission status
   */
  async checkPermission(): Promise<'granted' | 'denied' | 'prompt'> {
    if (Capacitor.isNativePlatform() && SpeechRecognitionPlugin) {
      try {
        const result = await SpeechRecognitionPlugin.checkPermissions();
        return result.speechRecognition as 'granted' | 'denied' | 'prompt';
      } catch {
        return 'prompt';
      }
    }

    // Web browser
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state;
    } catch {
      return 'prompt';
    }
  }

  /**
   * Start listening for speech
   */
  async startListening(
    config: NativeSpeechConfig,
    onResult: (result: SpeechRecognitionResult) => void,
    onEnd: () => void,
    onError?: (error: string) => void
  ): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isListening) {
      console.log('[NativeSpeech] Already listening');
      return true;
    }

    this.startTime = performance.now();
    this.onResultCallback = onResult;
    this.onEndCallback = onEnd;
    this.onErrorCallback = onError || null;
    this.currentLanguage = LANGUAGE_MAP[config.language] || config.language || 'en-IN';

    // Try native first
    if (Capacitor.isNativePlatform() && SpeechRecognitionPlugin) {
      return this.startNativeListening(config);
    }

    // Fall back to web
    return this.startWebListening(config);
  }

  private async startNativeListening(config: NativeSpeechConfig): Promise<boolean> {
    try {
      // Set up listeners
      SpeechRecognitionPlugin.addListener('partialResults', (data: any) => {
        if (data.matches && data.matches.length > 0) {
          const latencyMs = performance.now() - this.startTime;
          this.onResultCallback?.({
            transcript: data.matches[0],
            confidence: 0.85, // Native doesn't always provide confidence
            isFinal: false,
            provider: 'native',
            latencyMs,
          });
        }
      });

      // Start recognition
      await SpeechRecognitionPlugin.start({
        language: this.currentLanguage,
        maxResults: 3,
        popup: false,
        partialResults: config.interimResults ?? true,
      });

      this.isListening = true;
      console.log('[NativeSpeech] Native listening started:', this.currentLanguage);
      return true;
    } catch (error) {
      console.error('[NativeSpeech] Native start failed:', error);
      // Try web fallback
      return this.startWebListening(config);
    }
  }

  private startWebListening(config: NativeSpeechConfig): boolean {
    if (!this.webRecognition) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this.onErrorCallback?.('Speech recognition not supported');
        return false;
      }
      this.webRecognition = new SpeechRecognition();
    }

    const recognition = this.webRecognition;
    recognition.continuous = config.continuous ?? false;
    recognition.interimResults = config.interimResults ?? true;
    recognition.lang = this.currentLanguage;
    recognition.maxAlternatives = config.maxAlternatives ?? 3;

    recognition.onresult = (event: any) => {
      const latencyMs = performance.now() - this.startTime;
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence ?? 0.8;

      this.onResultCallback?.({
        transcript,
        confidence,
        isFinal: result.isFinal,
        provider: 'web',
        latencyMs,
      });
    };

    recognition.onend = () => {
      this.isListening = false;
      this.onEndCallback?.();
    };

    recognition.onerror = (event: any) => {
      console.error('[NativeSpeech] Web recognition error:', event.error);
      this.isListening = false;
      this.onErrorCallback?.(event.error);
      this.onEndCallback?.();
    };

    try {
      recognition.start();
      this.isListening = true;
      console.log('[NativeSpeech] Web listening started:', this.currentLanguage);
      return true;
    } catch (error) {
      console.error('[NativeSpeech] Web start failed:', error);
      this.onErrorCallback?.('Failed to start recognition');
      return false;
    }
  }

  /**
   * Stop listening
   */
  async stopListening(): Promise<SpeechRecognitionResult | null> {
    if (!this.isListening) return null;

    this.isListening = false;

    if (Capacitor.isNativePlatform() && SpeechRecognitionPlugin) {
      try {
        const result = await SpeechRecognitionPlugin.stop();
        await SpeechRecognitionPlugin.removeAllListeners();
        
        if (result.matches && result.matches.length > 0) {
          const latencyMs = performance.now() - this.startTime;
          const finalResult: SpeechRecognitionResult = {
            transcript: result.matches[0],
            confidence: 0.9,
            isFinal: true,
            provider: 'native',
            latencyMs,
          };
          this.onResultCallback?.(finalResult);
          this.onEndCallback?.();
          return finalResult;
        }
      } catch (error) {
        console.error('[NativeSpeech] Stop error:', error);
      }
    }

    if (this.webRecognition) {
      try {
        this.webRecognition.stop();
      } catch {
        // Ignore stop errors
      }
    }

    this.onEndCallback?.();
    return null;
  }

  /**
   * Check if currently listening
   */
  getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * Get available languages
   */
  getSupportedLanguages(): string[] {
    return Object.keys(LANGUAGE_MAP);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopListening();
    this.webRecognition = null;
    this.isInitialized = false;
  }
}

// Export singleton instance
export const nativeSpeechRecognition = new NativeSpeechRecognitionService();
export default nativeSpeechRecognition;
