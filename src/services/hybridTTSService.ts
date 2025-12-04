/**
 * Hybrid TTS Service
 * Combines Kokoro TTS (for English & Hindi) with Native TTS (for other Indian languages)
 * 
 * Strategy:
 * - English & Hindi: Use Kokoro TTS (high quality, offline once loaded)
 * - Other Indian languages: Use native device TTS via Capacitor or Web Speech API
 */

import { kokoroTTSService, KOKORO_SUPPORTED_LANGUAGES } from './kokoroTTSService';
import { nativeTTSService } from './nativeTTSService';
import { Capacitor } from '@capacitor/core';

export type TTSProvider = 'kokoro' | 'native' | 'web';

export interface HybridTTSConfig {
  rate?: number;
  pitch?: number;
  volume?: number;
  preferKokoro?: boolean; // Prefer Kokoro even if native is available
}

export interface TTSCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
}

export interface TTSResult {
  success: boolean;
  provider: TTSProvider;
  language: string;
  error?: string;
}

// All Indian languages supported (combination of Kokoro + Native)
export const ALL_SUPPORTED_LANGUAGES = {
  // Kokoro languages (high quality)
  en: { name: 'English', nativeName: 'English', provider: 'kokoro' as TTSProvider },
  hi: { name: 'Hindi', nativeName: 'हिन्दी', provider: 'kokoro' as TTSProvider },
  
  // Native TTS languages (device dependent)
  mr: { name: 'Marathi', nativeName: 'मराठी', provider: 'native' as TTSProvider },
  pa: { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', provider: 'native' as TTSProvider },
  kn: { name: 'Kannada', nativeName: 'ಕನ್ನಡ', provider: 'native' as TTSProvider },
  ta: { name: 'Tamil', nativeName: 'தமிழ்', provider: 'native' as TTSProvider },
  te: { name: 'Telugu', nativeName: 'తెలుగు', provider: 'native' as TTSProvider },
  bn: { name: 'Bengali', nativeName: 'বাংলা', provider: 'native' as TTSProvider },
  gu: { name: 'Gujarati', nativeName: 'ગુજરાતી', provider: 'native' as TTSProvider },
  ml: { name: 'Malayalam', nativeName: 'മലയാളം', provider: 'native' as TTSProvider },
  or: { name: 'Odia', nativeName: 'ଓଡ଼ିଆ', provider: 'native' as TTSProvider },
  as: { name: 'Assamese', nativeName: 'অসমীয়া', provider: 'native' as TTSProvider },
  ur: { name: 'Urdu', nativeName: 'اردو', provider: 'native' as TTSProvider },
} as const;

class HybridTTSService {
  private isSpeaking = false;
  private currentProvider: TTSProvider | null = null;
  private kokoroInitialized = false;
  private initializingKokoro = false;

  constructor() {
    console.log('[HybridTTS] Service created');
  }

  /**
   * Get the appropriate TTS provider for a language
   */
  getProviderForLanguage(language: string): TTSProvider {
    const langCode = language.split('-')[0].toLowerCase();
    
    // Check if Kokoro supports this language
    if (KOKORO_SUPPORTED_LANGUAGES.includes(langCode as any)) {
      return 'kokoro';
    }
    
    // Check if native TTS supports this language
    if (Capacitor.isNativePlatform()) {
      return 'native';
    }
    
    // Fall back to Web Speech API
    return 'web';
  }

  /**
   * Initialize Kokoro TTS (optional, can be done lazily)
   */
  async initializeKokoro(onProgress?: (progress: number) => void): Promise<boolean> {
    if (this.kokoroInitialized) {
      return true;
    }

    if (this.initializingKokoro) {
      // Wait for existing initialization
      while (this.initializingKokoro) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return this.kokoroInitialized;
    }

    this.initializingKokoro = true;
    
    try {
      console.log('[HybridTTS] Initializing Kokoro TTS...');
      const success = await kokoroTTSService.initialize(onProgress);
      this.kokoroInitialized = success;
      console.log(`[HybridTTS] Kokoro initialized: ${success}`);
      return success;
    } catch (error) {
      console.error('[HybridTTS] Failed to initialize Kokoro:', error);
      return false;
    } finally {
      this.initializingKokoro = false;
    }
  }

  /**
   * Speak text using the appropriate TTS provider
   */
  async speak(
    text: string,
    language: string = 'en',
    config?: HybridTTSConfig,
    callbacks?: TTSCallbacks
  ): Promise<TTSResult> {
    const langCode = language.split('-')[0].toLowerCase();
    let provider = this.getProviderForLanguage(langCode);
    
    console.log(`[HybridTTS] Speaking "${text.substring(0, 30)}..." in ${langCode} using ${provider}`);

    // Stop any current playback
    this.stop();
    
    this.isSpeaking = true;
    this.currentProvider = provider;

    try {
      let result: TTSResult;

      if (provider === 'kokoro') {
        // Use Kokoro TTS for English/Hindi
        result = await this.speakWithKokoro(text, langCode, callbacks);
      } else {
        // Use Native TTS for other languages
        result = await this.speakWithNative(text, langCode, config, callbacks);
      }

      return result;
    } catch (error) {
      console.error('[HybridTTS] Error speaking:', error);
      this.isSpeaking = false;
      
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      callbacks?.onError?.(error instanceof Error ? error : new Error(errorMsg));
      
      return {
        success: false,
        provider,
        language: langCode,
        error: errorMsg,
      };
    }
  }

  /**
   * Speak using Kokoro TTS
   */
  private async speakWithKokoro(
    text: string,
    language: string,
    callbacks?: TTSCallbacks
  ): Promise<TTSResult> {
    // Initialize Kokoro if not already done
    if (!this.kokoroInitialized) {
      console.log('[HybridTTS] Lazy-loading Kokoro TTS...');
      const initialized = await this.initializeKokoro();
      
      if (!initialized) {
        console.warn('[HybridTTS] Kokoro failed, falling back to native TTS');
        // Fall back to native TTS
        return this.speakWithNative(text, language, undefined, callbacks);
      }
    }

    const result = await kokoroTTSService.speak(text, language, undefined, {
      onStart: () => {
        this.isSpeaking = true;
        callbacks?.onStart?.();
      },
      onEnd: () => {
        this.isSpeaking = false;
        callbacks?.onEnd?.();
      },
      onError: (error) => {
        this.isSpeaking = false;
        callbacks?.onError?.(error);
      },
    });

    return {
      success: result.success,
      provider: 'kokoro',
      language,
      error: result.error,
    };
  }

  /**
   * Speak using Native TTS (Capacitor or Web Speech API)
   */
  private async speakWithNative(
    text: string,
    language: string,
    config?: HybridTTSConfig,
    callbacks?: TTSCallbacks
  ): Promise<TTSResult> {
    const result = await nativeTTSService.speak(
      text,
      language,
      {
        rate: config?.rate || 1.0,
        pitch: config?.pitch || 1.0,
        volume: config?.volume || 1.0,
      },
      {
        onStart: () => {
          this.isSpeaking = true;
          callbacks?.onStart?.();
        },
        onEnd: () => {
          this.isSpeaking = false;
          callbacks?.onEnd?.();
        },
        onError: (error) => {
          this.isSpeaking = false;
          callbacks?.onError?.(error);
        },
      }
    );

    return {
      success: result.success,
      provider: result.provider === 'native' ? 'native' : 'web',
      language: result.usedLanguage || language,
      error: result.error,
    };
  }

  /**
   * Stop current playback
   */
  stop(): void {
    if (this.currentProvider === 'kokoro') {
      kokoroTTSService.stop();
    } else {
      nativeTTSService.stop();
    }
    this.isSpeaking = false;
    this.currentProvider = null;
  }

  /**
   * Check if currently speaking
   */
  isCurrentlySpeaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Get current provider
   */
  getCurrentProvider(): TTSProvider | null {
    return this.currentProvider;
  }

  /**
   * Check if Kokoro is loaded
   */
  isKokoroLoaded(): boolean {
    return this.kokoroInitialized;
  }

  /**
   * Get Kokoro load progress
   */
  getKokoroLoadProgress(): number {
    return kokoroTTSService.getLoadProgress();
  }

  /**
   * Check if a language is supported
   */
  isLanguageSupported(language: string): boolean {
    const langCode = language.split('-')[0].toLowerCase();
    return langCode in ALL_SUPPORTED_LANGUAGES;
  }

  /**
   * Get all supported languages with their providers
   */
  getSupportedLanguages(): typeof ALL_SUPPORTED_LANGUAGES {
    return ALL_SUPPORTED_LANGUAGES;
  }

  /**
   * Get language info
   */
  getLanguageInfo(language: string): { name: string; nativeName: string; provider: TTSProvider } | null {
    const langCode = language.split('-')[0].toLowerCase() as keyof typeof ALL_SUPPORTED_LANGUAGES;
    return ALL_SUPPORTED_LANGUAGES[langCode] || null;
  }

  /**
   * Preload Kokoro model for faster first use
   * Call this during app initialization or when user is idle
   */
  async preloadKokoro(onProgress?: (progress: number) => void): Promise<boolean> {
    return this.initializeKokoro(onProgress);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stop();
    kokoroTTSService.cleanup();
  }
}

// Singleton instance
export const hybridTTSService = new HybridTTSService();
