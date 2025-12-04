import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

// Language codes supported by our cloud TTS
const SUPPORTED_LANGUAGES = [
  'hi', 'hi-IN', 'mr', 'mr-IN', 'ta', 'ta-IN', 'te', 'te-IN',
  'bn', 'bn-IN', 'gu', 'gu-IN', 'kn', 'kn-IN', 'ml', 'ml-IN',
  'pa', 'pa-IN', 'en', 'en-IN', 'en-US'
];

interface TTSOptions {
  text: string;
  language?: string;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

interface TTSResult {
  success: boolean;
  provider: 'cloud' | 'native' | 'web' | 'none';
  error?: string;
}

class UniversalTTSService {
  private currentAudio: HTMLAudioElement | null = null;
  private isPlaying = false;
  private nativeTTS: any = null;
  private currentRequestId: number = 0; // Track current request to prevent race conditions

  constructor() {
    this.initNativeTTS();
  }

  private async initNativeTTS() {
    if (Capacitor.isNativePlatform()) {
      try {
        const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
        this.nativeTTS = TextToSpeech;
        console.log('[UniversalTTS] Native TTS initialized');
      } catch (error) {
        console.warn('[UniversalTTS] Native TTS not available:', error);
      }
    }
  }

  /**
   * Main speak method - INSTANT START with Web Speech, Cloud as quality fallback
   * Priority: Web Speech API (instant) > Native > Cloud (async quality upgrade)
   */
  async speak(options: TTSOptions): Promise<TTSResult> {
    const { text, language = 'en-IN', rate = 1.0, onStart, onEnd, onError } = options;

    if (!text?.trim()) {
      return { success: false, provider: 'none', error: 'No text provided' };
    }

    // Generate new request ID and stop any current playback
    const requestId = ++this.currentRequestId;
    this.stop();

    // Call onStart IMMEDIATELY for instant feedback
    onStart?.();
    console.log('[UniversalTTS] Starting speech (instant feedback)');

    try {
      const baseLang = language.split('-')[0];
      
      // Languages that need Cloud TTS for quality (Indian languages)
      const needsCloudTTS = ['hi', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml', 'pa'].includes(baseLang);

      // For English and simple languages, use Web Speech API (INSTANT)
      if (!needsCloudTTS && 'speechSynthesis' in window) {
        console.log('[UniversalTTS] Using Web Speech API (instant)');
        const webResult = await this.speakWithWebAPI(text, language, rate, onEnd);
        if (webResult.success) {
          return webResult;
        }
      }

      // Try Native TTS for mobile (also instant)
      if (this.nativeTTS && requestId === this.currentRequestId) {
        console.log('[UniversalTTS] Trying Native TTS...');
        const nativeResult = await this.speakWithNative(text, language, rate);
        if (nativeResult.success) {
          onEnd?.();
          return nativeResult;
        }
      }

      // For Indian languages or when others fail, use Cloud TTS
      if (requestId === this.currentRequestId) {
        console.log('[UniversalTTS] Using Cloud TTS for better quality...');
        const cloudResult = await this.speakWithCloud(text, language, requestId);
        
        if (requestId !== this.currentRequestId) {
          console.log('[UniversalTTS] Request cancelled (superseded)');
          return { success: false, provider: 'none', error: 'Request cancelled' };
        }

        if (cloudResult.success) {
          this.waitForAudioEnd(onEnd);
          return cloudResult;
        }
      }

      // Final fallback to Web Speech API for any language
      if (requestId === this.currentRequestId && 'speechSynthesis' in window) {
        console.log('[UniversalTTS] Final fallback to Web Speech API');
        const webResult = await this.speakWithWebAPI(text, language, rate, onEnd);
        if (webResult.success) {
          return webResult;
        }
      }

      throw new Error('All TTS providers failed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'TTS failed';
      console.error('[UniversalTTS] Error:', errorMessage);
      onError?.(error instanceof Error ? error : new Error(errorMessage));
      return { success: false, provider: 'none', error: errorMessage };
    }
  }

  /**
   * Cloud TTS using our edge function (Google/OpenAI)
   */
  private async speakWithCloud(text: string, language: string, requestId: number): Promise<TTSResult> {
    try {
      console.log('[UniversalTTS] Trying Cloud TTS...');
      
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { text, language }
      });

      // Check if request is still valid before playing
      if (requestId !== this.currentRequestId) {
        console.log('[UniversalTTS] Cloud TTS response ignored (superseded)');
        return { success: false, provider: 'cloud', error: 'Request superseded' };
      }

      if (error) {
        console.warn('[UniversalTTS] Cloud TTS error:', error);
        return { success: false, provider: 'cloud', error: error.message };
      }

      if (!data?.audioContent) {
        return { success: false, provider: 'cloud', error: 'No audio returned' };
      }

      // Stop any existing audio before creating new one
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }

      // Play the audio
      const audioBlob = this.base64ToBlob(data.audioContent, 'audio/mp3');
      const audioUrl = URL.createObjectURL(audioBlob);
      
      this.currentAudio = new Audio(audioUrl);
      this.currentAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        this.isPlaying = false;
      };
      
      await this.currentAudio.play();
      this.isPlaying = true;

      console.log(`[UniversalTTS] Cloud TTS success (provider: ${data.provider})`);
      return { success: true, provider: 'cloud' };
    } catch (error) {
      console.warn('[UniversalTTS] Cloud TTS failed:', error);
      return { success: false, provider: 'cloud', error: String(error) };
    }
  }

  /**
   * Native TTS using Capacitor plugin
   */
  private async speakWithNative(text: string, language: string, rate: number): Promise<TTSResult> {
    try {
      if (!this.nativeTTS) {
        return { success: false, provider: 'native', error: 'Native TTS not available' };
      }

      console.log('[UniversalTTS] Trying Native TTS...');
      
      const langCode = this.mapLanguageCode(language);
      
      await this.nativeTTS.speak({
        text,
        lang: langCode,
        rate,
        pitch: 1.0,
        volume: 1.0,
        category: 'ambient'
      });

      console.log('[UniversalTTS] Native TTS success');
      return { success: true, provider: 'native' };
    } catch (error) {
      console.warn('[UniversalTTS] Native TTS failed:', error);
      return { success: false, provider: 'native', error: String(error) };
    }
  }

  /**
   * Web Speech API fallback
   */
  private async speakWithWebAPI(
    text: string, 
    language: string, 
    rate: number,
    onEnd?: () => void
  ): Promise<TTSResult> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve({ success: false, provider: 'web', error: 'Web Speech API not supported' });
        return;
      }

      // Cancel any existing speech first
      window.speechSynthesis.cancel();

      console.log('[UniversalTTS] Trying Web Speech API...');

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.mapLanguageCode(language);
      utterance.rate = rate;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find(v => v.lang.startsWith(language.split('-')[0]));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      utterance.onend = () => {
        this.isPlaying = false;
        onEnd?.();
        console.log('[UniversalTTS] Web Speech API completed');
        resolve({ success: true, provider: 'web' });
      };

      utterance.onerror = (event) => {
        this.isPlaying = false;
        console.warn('[UniversalTTS] Web Speech API error:', event.error);
        resolve({ success: false, provider: 'web', error: event.error });
      };

      window.speechSynthesis.speak(utterance);
      this.isPlaying = true;
    });
  }

  /**
   * Stop current playback
   */
  stop(): void {
    // DO NOT increment currentRequestId here - that's only done in speak()
    // This prevents the race condition where stop() + speak() would double-increment

    // Stop audio element
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    // Stop native TTS
    if (this.nativeTTS) {
      try {
        this.nativeTTS.stop();
      } catch (e) {
        // Ignore
      }
    }

    // Stop Web Speech API
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    this.isPlaying = false;
  }

  /**
   * Check if currently speaking
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Check language support
   */
  isLanguageSupported(language: string): boolean {
    const baseLang = language.split('-')[0];
    return SUPPORTED_LANGUAGES.some(l => l === language || l.startsWith(baseLang));
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return [...SUPPORTED_LANGUAGES];
  }

  // Helper methods
  private mapLanguageCode(language: string): string {
    const langMap: Record<string, string> = {
      'hi': 'hi-IN',
      'mr': 'mr-IN',
      'ta': 'ta-IN',
      'te': 'te-IN',
      'bn': 'bn-IN',
      'gu': 'gu-IN',
      'kn': 'kn-IN',
      'ml': 'ml-IN',
      'pa': 'pa-IN',
      'en': 'en-IN',
    };
    return langMap[language] || language;
  }

  private base64ToBlob(base64: string, contentType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  }

  private waitForAudioEnd(onEnd?: () => void): void {
    if (this.currentAudio) {
      this.currentAudio.onended = () => {
        this.isPlaying = false;
        onEnd?.();
      };
    }
  }
}

// Export singleton instance
export const universalTTSService = new UniversalTTSService();

// Export hook-friendly function
export async function speakText(
  text: string, 
  language?: string,
  options?: Partial<TTSOptions>
): Promise<TTSResult> {
  return universalTTSService.speak({
    text,
    language,
    ...options
  });
}

export function stopSpeaking(): void {
  universalTTSService.stop();
}
