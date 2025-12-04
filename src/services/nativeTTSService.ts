/**
 * Native-First TTS Service
 * Prioritizes Capacitor native TTS for instant playback (<100ms)
 * Falls back to Web Speech API, then Cloud TTS for quality
 */

import { Capacitor } from '@capacitor/core';

// Language mappings for native TTS
const LANGUAGE_VOICE_MAP: Record<string, { code: string; name: string }> = {
  'en': { code: 'en-IN', name: 'English (India)' },
  'hi': { code: 'hi-IN', name: 'हिंदी' },
  'mr': { code: 'mr-IN', name: 'मराठी' },
  'pa': { code: 'pa-IN', name: 'ਪੰਜਾਬੀ' },
  'ta': { code: 'ta-IN', name: 'தமிழ்' },
  // Additional Indian languages
  'te': { code: 'te-IN', name: 'తెలుగు' },
  'bn': { code: 'bn-IN', name: 'বাংলা' },
  'gu': { code: 'gu-IN', name: 'ગુજરાતી' },
  'kn': { code: 'kn-IN', name: 'ಕನ್ನಡ' },
  'ml': { code: 'ml-IN', name: 'മലയാളം' },
};

export interface TTSConfig {
  rate: number;       // 0.5 - 2.0
  pitch: number;      // 0.5 - 2.0
  volume: number;     // 0.0 - 1.0
}

export interface TTSCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
}

export type TTSProvider = 'native' | 'web' | 'cloud' | 'none';

export interface TTSResult {
  success: boolean;
  provider: TTSProvider;
  error?: string;
  startTime?: number;
}

class NativeTTSService {
  private nativeTTS: any = null;
  private isInitialized = false;
  private isPlaying = false;
  private currentRequestId = 0;
  private webUtterance: SpeechSynthesisUtterance | null = null;
  private currentCallbacks: TTSCallbacks = {};

  constructor() {
    this.initNativeTTS();
  }

  /**
   * Initialize native TTS plugin
   */
  private async initNativeTTS(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[NativeTTS] Not on native platform, skipping native init');
      this.isInitialized = true;
      return;
    }

    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      this.nativeTTS = TextToSpeech;
      
      // Test if TTS is available
      const languages = await this.nativeTTS.getSupportedLanguages();
      console.log('[NativeTTS] Native TTS initialized, supported languages:', languages.languages?.length || 0);
      
      this.isInitialized = true;
    } catch (error) {
      console.warn('[NativeTTS] Failed to initialize native TTS:', error);
      this.isInitialized = true; // Still mark as initialized to allow fallbacks
    }
  }

  /**
   * Wait for initialization
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;
    
    // Wait up to 2 seconds for initialization
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.isInitialized) return;
    }
    console.warn('[NativeTTS] Initialization timeout');
  }

  /**
   * Get language code from short code
   */
  getLanguageCode(language: string): string {
    const baseLang = language.split('-')[0];
    return LANGUAGE_VOICE_MAP[baseLang]?.code || language;
  }

  /**
   * Check if native TTS is available
   */
  isNativeAvailable(): boolean {
    return !!this.nativeTTS && Capacitor.isNativePlatform();
  }

  /**
   * Main speak method - INSTANT START priority
   * Order: Native (instant) → Web Speech (instant) → Cloud (fallback)
   */
  async speak(
    text: string, 
    language: string = 'hi-IN',
    config: Partial<TTSConfig> = {},
    callbacks: TTSCallbacks = {}
  ): Promise<TTSResult> {
    const startTime = performance.now();
    
    if (!text?.trim()) {
      return { success: false, provider: 'none', error: 'No text provided' };
    }

    await this.ensureInitialized();

    // Generate new request ID and stop current playback
    const requestId = ++this.currentRequestId;
    this.stop();
    
    this.currentCallbacks = callbacks;
    const langCode = this.getLanguageCode(language);
    const { rate = 1.0, pitch = 1.0, volume = 1.0 } = config;

    console.log(`[NativeTTS] Starting speech: lang=${langCode}, text=${text.substring(0, 50)}...`);

    // PRIORITY 1: Native TTS (instant on mobile)
    if (this.isNativeAvailable()) {
      try {
        const result = await this.speakNative(text, langCode, { rate, pitch, volume }, requestId);
        if (result.success) {
          return { ...result, startTime: performance.now() - startTime };
        }
      } catch (error) {
        console.warn('[NativeTTS] Native TTS failed:', error);
      }
    }

    // PRIORITY 2: Web Speech API (instant on web)
    if ('speechSynthesis' in window) {
      try {
        const result = await this.speakWeb(text, langCode, { rate, pitch, volume }, requestId);
        if (result.success) {
          return { ...result, startTime: performance.now() - startTime };
        }
      } catch (error) {
        console.warn('[NativeTTS] Web Speech failed:', error);
      }
    }

    // All providers failed
    callbacks.onError?.(new Error('No TTS provider available'));
    return { 
      success: false, 
      provider: 'none', 
      error: 'No TTS provider available',
      startTime: performance.now() - startTime
    };
  }

  /**
   * Native TTS using Capacitor plugin
   */
  private async speakNative(
    text: string, 
    langCode: string, 
    config: TTSConfig,
    requestId: number
  ): Promise<TTSResult> {
    if (requestId !== this.currentRequestId) {
      return { success: false, provider: 'native', error: 'Request cancelled' };
    }

    try {
      this.isPlaying = true;
      this.currentCallbacks.onStart?.();

      await this.nativeTTS.speak({
        text,
        lang: langCode,
        rate: config.rate,
        pitch: config.pitch,
        volume: config.volume,
        category: 'ambient', // Allow mixing with other audio
      });

      if (requestId === this.currentRequestId) {
        this.isPlaying = false;
        this.currentCallbacks.onEnd?.();
      }

      console.log('[NativeTTS] Native TTS completed successfully');
      return { success: true, provider: 'native' };
    } catch (error) {
      this.isPlaying = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[NativeTTS] Native speak error:', errorMsg);
      return { success: false, provider: 'native', error: errorMsg };
    }
  }

  /**
   * Web Speech API fallback
   */
  private async speakWeb(
    text: string, 
    langCode: string, 
    config: TTSConfig,
    requestId: number
  ): Promise<TTSResult> {
    return new Promise((resolve) => {
      if (requestId !== this.currentRequestId) {
        resolve({ success: false, provider: 'web', error: 'Request cancelled' });
        return;
      }

      // Cancel any existing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langCode;
      utterance.rate = config.rate;
      utterance.pitch = config.pitch;
      utterance.volume = config.volume;

      // Find best voice for language
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find(v => 
        v.lang === langCode || v.lang.startsWith(langCode.split('-')[0])
      );
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      this.webUtterance = utterance;

      utterance.onstart = () => {
        if (requestId === this.currentRequestId) {
          this.isPlaying = true;
          this.currentCallbacks.onStart?.();
          console.log('[NativeTTS] Web Speech started');
        }
      };

      utterance.onend = () => {
        if (requestId === this.currentRequestId) {
          this.isPlaying = false;
          this.currentCallbacks.onEnd?.();
          console.log('[NativeTTS] Web Speech completed');
        }
        resolve({ success: true, provider: 'web' });
      };

      utterance.onerror = (event) => {
        this.isPlaying = false;
        const errorMsg = event.error || 'Unknown error';
        console.error('[NativeTTS] Web Speech error:', errorMsg);
        resolve({ success: false, provider: 'web', error: errorMsg });
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Stop current playback
   */
  stop(): void {
    // Stop native TTS
    if (this.nativeTTS) {
      try {
        this.nativeTTS.stop();
      } catch (e) {
        // Ignore
      }
    }

    // Stop Web Speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    this.webUtterance = null;
    this.isPlaying = false;
    this.currentCallbacks = {};
  }

  /**
   * Pause playback (Web Speech only)
   */
  pause(): void {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
  }

  /**
   * Resume playback (Web Speech only)
   */
  resume(): void {
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }

  /**
   * Check if currently speaking
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): Array<{ code: string; name: string }> {
    return Object.entries(LANGUAGE_VOICE_MAP).map(([key, value]) => ({
      code: value.code,
      name: value.name,
    }));
  }

  /**
   * Check if language is supported
   */
  isLanguageSupported(language: string): boolean {
    const baseLang = language.split('-')[0];
    return baseLang in LANGUAGE_VOICE_MAP;
  }
}

// Export singleton
export const nativeTTSService = new NativeTTSService();

// Convenience functions
export const speakNow = (
  text: string, 
  language?: string, 
  config?: Partial<TTSConfig>,
  callbacks?: TTSCallbacks
) => nativeTTSService.speak(text, language, config, callbacks);

export const stopSpeaking = () => nativeTTSService.stop();
export const pauseSpeaking = () => nativeTTSService.pause();
export const resumeSpeaking = () => nativeTTSService.resume();
