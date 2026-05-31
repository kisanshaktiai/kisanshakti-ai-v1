/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TTS FACADE - Unified Text-to-Speech Service
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Single entry point for all TTS functionality.
 * Consolidates 8 different TTS implementations into one clean API.
 * 
 * Priority order:
 * 1. Kokoro TTS (high quality, Hindi/English)
 * 2. Native TTS (Capacitor, all Indian languages)
 * 3. Web Speech API (browser fallback)
 * 4. Cloud TTS (Supabase edge function, last resort)
 */

import { Capacitor } from '@capacitor/core';

// Types
export interface TTSOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export interface TTSResult {
  success: boolean;
  provider: 'kokoro' | 'native' | 'web' | 'cloud' | 'none';
  error?: string;
}

export type TTSProvider = 'kokoro' | 'native' | 'web' | 'cloud' | 'auto';

// Supported languages
const KOKORO_LANGUAGES = ['en', 'hi'];
const NATIVE_LANGUAGES = ['mr', 'hi', 'en', 'ta', 'te', 'kn', 'ml', 'gu', 'bn', 'pa', 'or'];

/**
 * Unified TTS Facade - Single API for all text-to-speech needs
 */
class TTSFacadeService {
  private isPlaying = false;
  private audioElement: HTMLAudioElement | null = null;
  private kokoroService: any = null;
  private nativeService: any = null;
  
  /**
   * Speak text using the best available provider
   */
  async speak(text: string, options: TTSOptions = {}): Promise<TTSResult> {
    if (!text?.trim()) {
      return { success: false, provider: 'none', error: 'Empty text' };
    }
    
    const language = options.language || 'en';
    
    try {
      this.isPlaying = true;
      options.onStart?.();
      
      // Try providers in priority order
      const result = await this.tryProviders(text, language, options);
      
      if (result.success) {
        options.onEnd?.();
      } else {
        options.onError?.(result.error || 'TTS failed');
      }
      
      return result;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'TTS error';
      options.onError?.(errorMsg);
      return { success: false, provider: 'none', error: errorMsg };
    } finally {
      this.isPlaying = false;
    }
  }
  
  /**
   * Try providers in priority order
   */
  private async tryProviders(
    text: string, 
    language: string, 
    options: TTSOptions
  ): Promise<TTSResult> {
    // 1. Try Kokoro for Hindi/English (high quality)
    if (KOKORO_LANGUAGES.includes(language)) {
      const kokoroResult = await this.tryKokoro(text, language, options);
      if (kokoroResult.success) return kokoroResult;
    }
    
    // 2. Try Native TTS on mobile
    if (Capacitor.isNativePlatform()) {
      const nativeResult = await this.tryNative(text, language, options);
      if (nativeResult.success) return nativeResult;
    }
    
    // 3. Try Web Speech API
    const webResult = await this.tryWebSpeech(text, language, options);
    if (webResult.success) return webResult;
    
    // 4. Try Cloud TTS as last resort
    return this.tryCloud(text, language, options);
  }
  
  /**
   * Try Kokoro TTS (lazy load)
   */
  private async tryKokoro(
    text: string, 
    language: string, 
    options: TTSOptions
  ): Promise<TTSResult> {
    try {
      if (!this.kokoroService) {
        const { kokoroTTSService } = await import('@/services/kokoroTTSService');
        this.kokoroService = kokoroTTSService;
      }
      
      if (!this.kokoroService.isModelLoaded()) {
        await this.kokoroService.initialize();
      }
      
      const result = await this.kokoroService.speak(text, language);
      return { success: result.success, provider: 'kokoro', error: result.error };
      
    } catch (error) {
      console.warn('[TTSFacade] Kokoro failed:', error);
      return { success: false, provider: 'kokoro', error: 'Kokoro unavailable' };
    }
  }
  
  /**
   * Try Native TTS (Capacitor)
   */
  private async tryNative(
    text: string, 
    language: string, 
    options: TTSOptions
  ): Promise<TTSResult> {
    try {
      if (!this.nativeService) {
        const { nativeTTSService } = await import('@/services/nativeTTSService');
        this.nativeService = nativeTTSService;
      }
      
      const result = await this.nativeService.speak(text, language, {
        rate: options.rate,
        pitch: options.pitch,
        volume: options.volume
      });
      
      return { success: result.success, provider: 'native', error: result.error };
      
    } catch (error) {
      console.warn('[TTSFacade] Native TTS failed:', error);
      return { success: false, provider: 'native', error: 'Native TTS unavailable' };
    }
  }
  
  /**
   * Try Web Speech API — but ONLY if the browser actually has a voice
   * matching the requested language. Otherwise speechSynthesis silently
   * falls back to the default (usually English) voice and reads
   * Marathi/Hindi text with an English voice, which is unintelligible.
   */
  private async tryWebSpeech(
    text: string,
    language: string,
    options: TTSOptions
  ): Promise<TTSResult> {
    if (!('speechSynthesis' in window)) {
      return { success: false, provider: 'web', error: 'Web Speech not supported' };
    }

    const targetLang = this.getWebSpeechLang(language);
    const voice = await this.findVoiceForLang(targetLang, language);

    if (!voice) {
      console.warn(
        `[TTSFacade] No Web Speech voice for "${targetLang}" — skipping to Cloud TTS`
      );
      return {
        success: false,
        provider: 'web',
        error: `No installed voice for ${targetLang}`,
      };
    }

    return new Promise((resolve) => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang || targetLang;
        utterance.rate = options.rate || 1.0;
        utterance.pitch = options.pitch || 1.0;
        utterance.volume = options.volume || 1.0;

        utterance.onend = () => resolve({ success: true, provider: 'web' });
        utterance.onerror = (e) =>
          resolve({ success: false, provider: 'web', error: e.error });

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        resolve({ success: false, provider: 'web', error: 'Web Speech failed' });
      }
    });
  }

  /**
   * Resolve a SpeechSynthesisVoice that actually matches the target
   * language. Some browsers populate voices asynchronously, so we wait
   * up to ~600ms for them to load before giving up.
   */
  private async findVoiceForLang(
    targetLang: string,
    baseLang: string
  ): Promise<SpeechSynthesisVoice | null> {
    const pick = (): SpeechSynthesisVoice | null => {
      const voices = window.speechSynthesis.getVoices() || [];
      if (voices.length === 0) return null;
      const lc = targetLang.toLowerCase();
      const base = baseLang.toLowerCase();
      // exact match (e.g. mr-IN), then base prefix (mr*), then base lang token
      return (
        voices.find((v) => v.lang?.toLowerCase() === lc) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith(base + '-')) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith(base)) ||
        null
      );
    };

    let v = pick();
    if (v) return v;

    // Wait for voices to load (Chrome quirk)
    return new Promise((resolve) => {
      let settled = false;
      const finish = (val: SpeechSynthesisVoice | null) => {
        if (settled) return;
        settled = true;
        window.speechSynthesis.onvoiceschanged = null;
        resolve(val);
      };
      window.speechSynthesis.onvoiceschanged = () => finish(pick());
      setTimeout(() => finish(pick()), 600);
    });
  }
  
  /**
   * Try Cloud TTS (Supabase edge function)
   */
  private async tryCloud(
    text: string, 
    language: string, 
    options: TTSOptions
  ): Promise<TTSResult> {
    try {
      const { supabase } = await import('@/integrations/supabase/client');

      // Edge function expects BCP-47 (e.g. mr-IN), not raw "mr".
      const langCode = this.getWebSpeechLang(language);

      const { data, error } = await supabase.functions.invoke('community-tts', {
        body: { text, language: langCode }
      });

      if (error) {
        return { success: false, provider: 'cloud', error: error.message };
      }

      // Edge function returns { audioContent }; legacy shape was { audio }.
      const audio = data?.audioContent ?? data?.audio;
      if (!audio) {
        return {
          success: false,
          provider: 'cloud',
          error: data?.error || 'No audio returned',
        };
      }

      await this.playAudioBase64(audio);
      return { success: true, provider: 'cloud' };

    } catch (error) {
      console.warn('[TTSFacade] Cloud TTS failed:', error);
      const msg = error instanceof Error ? error.message : 'Cloud TTS unavailable';
      return { success: false, provider: 'cloud', error: msg };
    }
  }
  
  /**
   * Play base64 audio
   */
  private async playAudioBase64(base64: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stop();
      
      this.audioElement = new Audio(`data:audio/mp3;base64,${base64}`);
      this.audioElement.onended = () => resolve();
      this.audioElement.onerror = () => reject(new Error('Audio playback failed'));
      this.audioElement.play();
    });
  }
  
  /**
   * Get Web Speech API language code
   */
  private getWebSpeechLang(language: string): string {
    const langMap: Record<string, string> = {
      'en': 'en-IN',
      'hi': 'hi-IN',
      'mr': 'mr-IN',
      'ta': 'ta-IN',
      'te': 'te-IN',
      'kn': 'kn-IN',
      'ml': 'ml-IN',
      'gu': 'gu-IN',
      'bn': 'bn-IN',
      'pa': 'pa-IN',
      'or': 'or-IN'
    };
    return langMap[language] || language;
  }
  
  /**
   * Stop any playing audio
   */
  stop(): void {
    this.isPlaying = false;
    
    // Stop Web Speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    // Stop audio element
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement = null;
    }
    
    // Stop Kokoro
    this.kokoroService?.stop?.();
    
    // Stop Native
    this.nativeService?.stop?.();
  }
  
  /**
   * Check if TTS is currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }
  
  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return [...new Set([...KOKORO_LANGUAGES, ...NATIVE_LANGUAGES])];
  }
  
  /**
   * Check if language is supported
   */
  isLanguageSupported(language: string): boolean {
    return this.getSupportedLanguages().includes(language);
  }
}

// Singleton instance
export const ttsFacade = new TTSFacadeService();

// Convenience functions
export const speak = (text: string, options?: TTSOptions) => ttsFacade.speak(text, options);
export const stopSpeaking = () => ttsFacade.stop();
