/**
 * Unified farmer-facing TTS facade.
 *
 * Policy:
 *  - ONLINE: prefer the server TTS provider (Bhashini via community-tts).
 *  - OFFLINE: use the device's exact-language native voice.
 *  - Browser: use an exact-language Web Speech voice only.
 *  - Kokoro is retained only as an explicit/local fallback for en/hi.
 *
 * A provider is never allowed to silently speak an Indian-language response
 * with another language's voice.
 */

import { Capacitor } from '@capacitor/core';
import { stripForSpeech } from '@/services/tts/ttsTextPrepare';

export interface TTSOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  /** Prefer network neural TTS when online. Defaults true. */
  preferNatural?: boolean;
  /** Force device/offline path. */
  offlineOnly?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export interface TTSResult {
  success: boolean;
  provider: 'bhashini' | 'kokoro' | 'native' | 'web' | 'cloud' | 'none';
  error?: string;
  language?: string;
}

export type TTSProvider = TTSResult['provider'] | 'auto';

const LOCAL_KOKORO_LANGUAGES = new Set(['en', 'hi']);
const CANONICAL_LANGUAGES = new Set([
  'en', 'hi', 'mr', 'ta', 'te', 'kn', 'ml', 'gu', 'bn', 'pa', 'or', 'as', 'ur',
  'mai', 'sa', 'ne', 'sd', 'kok', 'doi', 'mni', 'sat', 'ks', 'bo', 'bh', 'raj',
  'awa', 'mag', 'hne', 'gom',
]);

const LANGUAGE_CODES: Record<string, string> = {
  en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN',
  ml: 'ml-IN', gu: 'gu-IN', bn: 'bn-IN', pa: 'pa-IN', or: 'or-IN', as: 'as-IN',
  ur: 'ur-IN', mai: 'mai-IN', sa: 'sa-IN', ne: 'ne-IN', sd: 'sd-IN', kok: 'kok-IN',
  doi: 'doi-IN', mni: 'mni-IN', sat: 'sat-IN', ks: 'ks-IN', bo: 'bo-IN', bh: 'bh-IN',
  raj: 'raj-IN', awa: 'awa-IN', mag: 'mag-IN', hne: 'hne-IN', gom: 'gom-IN',
};

function baseLanguage(language: string): string {
  return language.trim().toLowerCase().split('-')[0];
}

function isOnline(): boolean {
  // navigator.onLine is only a routing hint; the provider itself remains the
  // final authority because captive portals and transient connectivity exist.
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

class TTSFacadeService {
  private isPlaying = false;
  private audioElement: HTMLAudioElement | null = null;
  private kokoroService: any = null;
  private nativeService: any = null;

  async speak(text: string, options: TTSOptions = {}): Promise<TTSResult> {
    if (!text?.trim()) return { success: false, provider: 'none', error: 'Empty text' };

    const language = baseLanguage(options.language || 'en');
    if (!CANONICAL_LANGUAGES.has(language)) {
      const result = { success: false, provider: 'none' as const, error: `Unsupported language: ${language}` };
      options.onError?.(result.error);
      return result;
    }

    // One normalization pass for every provider. This keeps technical values,
    // tables, bullets and Markdown from being interpreted as visual markup.
    const speechText = stripForSpeech(text, { targetChars: 1100, maxChars: 1400 });
    if (!speechText.trim()) {
      return { success: false, provider: 'none', error: 'No speakable text' };
    }

    try {
      this.isPlaying = true;
      options.onStart?.();

      const result = await this.tryProviders(speechText, language, options);
      if (result.success) options.onEnd?.();
      else options.onError?.(result.error || 'TTS failed');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TTS error';
      options.onError?.(message);
      return { success: false, provider: 'none', error: message };
    } finally {
      this.isPlaying = false;
    }
  }

  private async tryProviders(text: string, language: string, options: TTSOptions): Promise<TTSResult> {
    // Explicit offline mode never makes a network request.
    if (options.offlineOnly) {
      return Capacitor.isNativePlatform()
        ? this.tryNative(text, language, options)
        : this.tryWebSpeech(text, language, options);
    }

    // Online-first is intentional: native TTS is the resilience/offline tier,
    // while Bhashini is the natural Indian-language neural tier.
    if (options.preferNatural !== false && isOnline()) {
      const cloud = await this.tryCloud(text, language, options);
      if (cloud.success) return cloud;
    }

    // Mobile offline/resilience path. Native service verifies the actual device
    // voice inventory and does not substitute another language silently.
    if (Capacitor.isNativePlatform()) {
      const native = await this.tryNative(text, language, options);
      if (native.success) return native;
    }

    // Browser fallback is exact-language only.
    const web = await this.tryWebSpeech(text, language, options);
    if (web.success) return web;

    // Local neural fallback only where the model is actually language-capable.
    if (LOCAL_KOKORO_LANGUAGES.has(language)) {
      const kokoro = await this.tryKokoro(text, language, options);
      if (kokoro.success) return kokoro;
    }

    // One final network attempt handles navigator.onLine false positives.
    if (options.preferNatural !== false && !options.offlineOnly) {
      const cloud = await this.tryCloud(text, language, options);
      if (cloud.success) return cloud;
    }

    return { success: false, provider: 'none', error: `No exact-language voice available for ${language}` };
  }

  private async tryNative(text: string, language: string, options: TTSOptions): Promise<TTSResult> {
    try {
      if (!this.nativeService) {
        const { nativeTTSService } = await import('@/services/nativeTTSService');
        this.nativeService = nativeTTSService;
      }
      const result = await this.nativeService.speak(text, language, {
        rate: options.rate,
        pitch: options.pitch,
        volume: options.volume,
      });
      return {
        success: result.success,
        provider: 'native',
        error: result.error,
        language: result.usedLanguage || language,
      };
    } catch (error) {
      return { success: false, provider: 'native', error: error instanceof Error ? error.message : 'Native TTS unavailable' };
    }
  }

  private async tryWebSpeech(text: string, language: string, options: TTSOptions): Promise<TTSResult> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return { success: false, provider: 'web', error: 'Web Speech not supported' };
    }

    const targetLang = LANGUAGE_CODES[language] || `${language}-IN`;
    const voice = await this.findVoiceForLang(targetLang, language);
    if (!voice) return { success: false, provider: 'web', error: `No exact-language browser voice for ${targetLang}` };

    return new Promise((resolve) => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang || targetLang;
        utterance.rate = Math.min(1.05, Math.max(0.82, options.rate ?? 0.94));
        utterance.pitch = options.pitch ?? 1.0;
        utterance.volume = options.volume ?? 1.0;
        utterance.onend = () => resolve({ success: true, provider: 'web', language });
        utterance.onerror = (event) => resolve({ success: false, provider: 'web', error: event.error || 'Web Speech failed' });
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        resolve({ success: false, provider: 'web', error: error instanceof Error ? error.message : 'Web Speech failed' });
      }
    });
  }

  private async findVoiceForLang(targetLang: string, baseLang: string): Promise<SpeechSynthesisVoice | null> {
    const pick = () => {
      const voices = window.speechSynthesis.getVoices() || [];
      const target = targetLang.toLowerCase();
      const base = baseLang.toLowerCase();
      return voices.find((v) => v.lang?.toLowerCase() === target)
        || voices.find((v) => v.lang?.toLowerCase().startsWith(`${base}-`))
        || null;
    };
    const immediate = pick();
    if (immediate) return immediate;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (voice: SpeechSynthesisVoice | null) => {
        if (settled) return;
        settled = true;
        window.speechSynthesis.onvoiceschanged = null;
        resolve(voice);
      };
      window.speechSynthesis.onvoiceschanged = () => finish(pick());
      setTimeout(() => finish(pick()), 800);
    });
  }

  private async tryKokoro(text: string, language: string, _options: TTSOptions): Promise<TTSResult> {
    try {
      if (!this.kokoroService) {
        const { kokoroTTSService } = await import('@/services/kokoroTTSService');
        this.kokoroService = kokoroTTSService;
      }
      if (!this.kokoroService.isLanguageSupported(language)) {
        return { success: false, provider: 'kokoro', error: `Kokoro does not support ${language}` };
      }
      if (!this.kokoroService.isModelLoaded()) await this.kokoroService.initialize();
      const result = await this.kokoroService.speak(text, language);
      return { success: result.success, provider: 'kokoro', error: result.error, language };
    } catch (error) {
      return { success: false, provider: 'kokoro', error: error instanceof Error ? error.message : 'Kokoro unavailable' };
    }
  }

  private async tryCloud(text: string, language: string, _options: TTSOptions): Promise<TTSResult> {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('community-tts', {
        body: { text, language },
      });
      if (error) return { success: false, provider: 'cloud', error: error.message };
      const audio = data?.audioContent ?? data?.audio;
      if (!audio) return { success: false, provider: 'cloud', error: data?.error || 'No audio returned' };
      await this.playAudioBase64(audio, data?.mimeType || 'audio/wav');
      return { success: true, provider: data?.provider === 'bhashini' ? 'bhashini' : 'cloud', language };
    } catch (error) {
      return { success: false, provider: 'cloud', error: error instanceof Error ? error.message : 'Cloud TTS unavailable' };
    }
  }

  private async playAudioBase64(base64: string, mimeType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stop();
      this.audioElement = new Audio(`data:${mimeType};base64,${base64}`);
      this.audioElement.onended = () => resolve();
      this.audioElement.onerror = () => reject(new Error('Audio playback failed'));
      void this.audioElement.play().catch(reject);
    });
  }

  stop(): void {
    this.isPlaying = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement = null;
    }
    this.kokoroService?.stop?.();
    this.nativeService?.stop?.();
  }

  getIsPlaying(): boolean { return this.isPlaying; }

  getSupportedLanguages(): string[] { return [...CANONICAL_LANGUAGES]; }

  isLanguageSupported(language: string): boolean { return CANONICAL_LANGUAGES.has(baseLanguage(language)); }
}

export const ttsFacade = new TTSFacadeService();
export const speak = (text: string, options?: TTSOptions) => ttsFacade.speak(text, options);
export const stopSpeaking = () => ttsFacade.stop();
