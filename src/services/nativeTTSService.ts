/**
 * Native-First TTS Service for Capacitor Android/iOS APK
 * Uses ONLY Capacitor Native TTS - NO Web Speech API (doesn't work in APK)
 * Supports ALL 22 official Indian languages + dialects
 */

import { Capacitor } from '@capacitor/core';

// ALL Indian languages with native TTS codes
// 22 Official Languages + major dialects
const ALL_INDIAN_LANGUAGES: Record<string, { code: string; name: string; nativeName: string }> = {
  // Scheduled Languages (22 Official)
  'hi': { code: 'hi-IN', name: 'Hindi', nativeName: 'हिंदी' },
  'bn': { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা' },
  'te': { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు' },
  'mr': { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी' },
  'ta': { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்' },
  'gu': { code: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  'ur': { code: 'ur-IN', name: 'Urdu', nativeName: 'اردو' },
  'kn': { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  'or': { code: 'or-IN', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  'ml': { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം' },
  'pa': { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  'as': { code: 'as-IN', name: 'Assamese', nativeName: 'অসমীয়া' },
  'mai': { code: 'mai-IN', name: 'Maithili', nativeName: 'मैथिली' },
  'sa': { code: 'sa-IN', name: 'Sanskrit', nativeName: 'संस्कृतम्' },
  'ne': { code: 'ne-IN', name: 'Nepali', nativeName: 'नेपाली' },
  'sd': { code: 'sd-IN', name: 'Sindhi', nativeName: 'سنڌي' },
  'kok': { code: 'kok-IN', name: 'Konkani', nativeName: 'कोंकणी' },
  'doi': { code: 'doi-IN', name: 'Dogri', nativeName: 'डोगरी' },
  'mni': { code: 'mni-IN', name: 'Manipuri', nativeName: 'মৈতৈলোন্' },
  'sat': { code: 'sat-IN', name: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ' },
  'ks': { code: 'ks-IN', name: 'Kashmiri', nativeName: 'कॉशुर' },
  'bo': { code: 'bo-IN', name: 'Bodo', nativeName: 'बड़ो' },
  
  // English variants
  'en': { code: 'en-IN', name: 'English (India)', nativeName: 'English' },
  'en-US': { code: 'en-US', name: 'English (US)', nativeName: 'English' },
  'en-GB': { code: 'en-GB', name: 'English (UK)', nativeName: 'English' },
  
  // Regional dialects commonly used
  'bh': { code: 'bh-IN', name: 'Bhojpuri', nativeName: 'भोजपुरी' },
  'raj': { code: 'raj-IN', name: 'Rajasthani', nativeName: 'राजस्थानी' },
  'awa': { code: 'awa-IN', name: 'Awadhi', nativeName: 'अवधी' },
  'mag': { code: 'mag-IN', name: 'Magahi', nativeName: 'मगही' },
  'hne': { code: 'hne-IN', name: 'Chhattisgarhi', nativeName: 'छत्तीसगढ़ी' },
  'gom': { code: 'gom-IN', name: 'Goan Konkani', nativeName: 'गोंयची कोंकणी' },
};

// Fallback mapping for ALL Indian languages when voice not available on device
// Priority: Same script family → Hindi → English (NEVER direct to English for Indian languages)
const FALLBACK_LANGUAGES: Record<string, string> = {
  // === DEVANAGARI SCRIPT LANGUAGES → Hindi ===
  'mr': 'hi-IN',     // Marathi → Hindi (same Devanagari script)
  'mai': 'hi-IN',    // Maithili → Hindi
  'bh': 'hi-IN',     // Bhojpuri → Hindi
  'awa': 'hi-IN',    // Awadhi → Hindi
  'mag': 'hi-IN',    // Magahi → Hindi
  'hne': 'hi-IN',    // Chhattisgarhi → Hindi
  'raj': 'hi-IN',    // Rajasthani → Hindi
  'sa': 'hi-IN',     // Sanskrit → Hindi
  'ne': 'hi-IN',     // Nepali → Hindi
  'doi': 'hi-IN',    // Dogri → Hindi
  'kok': 'hi-IN',    // Konkani → Hindi
  'gom': 'hi-IN',    // Goan Konkani → Hindi
  'bo': 'hi-IN',     // Bodo → Hindi
  'sat': 'hi-IN',    // Santali → Hindi
  
  // === DRAVIDIAN LANGUAGES → Hindi (as last resort) ===
  'ta': 'hi-IN',     // Tamil → Hindi
  'te': 'hi-IN',     // Telugu → Hindi
  'kn': 'hi-IN',     // Kannada → Hindi
  'ml': 'hi-IN',     // Malayalam → Hindi
  
  // === BENGALI SCRIPT LANGUAGES → Bengali → Hindi ===
  'bn': 'hi-IN',     // Bengali → Hindi (when Bengali not available)
  'as': 'bn-IN',     // Assamese → Bengali (similar script)
  'mni': 'bn-IN',    // Manipuri → Bengali
  
  // === GURMUKHI SCRIPT ===
  'pa': 'hi-IN',     // Punjabi → Hindi
  
  // === GUJARATI SCRIPT ===
  'gu': 'hi-IN',     // Gujarati → Hindi
  
  // === ODIA SCRIPT ===
  'or': 'hi-IN',     // Odia → Hindi
  
  // === PERSO-ARABIC SCRIPT → Urdu → Hindi ===
  'ur': 'hi-IN',     // Urdu → Hindi
  'ks': 'ur-IN',     // Kashmiri → Urdu
  'sd': 'ur-IN',     // Sindhi → Urdu
  
  // === HINDI ITSELF → English (only if Hindi not available) ===
  'hi': 'en-IN',     // Hindi → English (last resort)
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

export type TTSProvider = 'native' | 'none';

export interface TTSResult {
  success: boolean;
  provider: TTSProvider;
  error?: string;
  startTime?: number;
  usedLanguage?: string;
  requestedLanguage?: string;
}

class NativeTTSService {
  private nativeTTS: any = null;
  private isInitialized = false;
  private isPlaying = false;
  private currentRequestId = 0;
  private currentCallbacks: TTSCallbacks = {};
  private supportedLanguages: string[] = [];
  private initPromise: Promise<void> | null = null;
  private isStopping = false;

  constructor() {
    this.initPromise = this.initNativeTTS();
  }

  /**
   * Initialize native TTS plugin
   */
  private async initNativeTTS(): Promise<void> {
    console.log('[NativeTTS] Initializing...');
    console.log('[NativeTTS] Platform:', Capacitor.getPlatform(), 'isNative:', Capacitor.isNativePlatform());
    
    try {
      // Import Capacitor TTS plugin
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      this.nativeTTS = TextToSpeech;
      
      // Get supported languages from device
      try {
        const result = await this.nativeTTS.getSupportedLanguages();
        this.supportedLanguages = result.languages || [];
        console.log('[NativeTTS] Device supported languages:', this.supportedLanguages.length, this.supportedLanguages.slice(0, 10));
      } catch (e) {
        console.warn('[NativeTTS] Could not get supported languages:', e);
        // In browser/PWA mode, native plugin may fail - use comprehensive fallback list
        // This ensures Indian languages are "assumed available" and will be tried
        this.supportedLanguages = [
          'hi-IN', 'en-IN', 'en-US', 'en-GB',
          'mr-IN', 'ta-IN', 'te-IN', 'bn-IN', 
          'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN',
          'ur-IN', 'or-IN', 'as-IN'
        ];
        console.log('[NativeTTS] Using fallback language list for browser/PWA mode');
      }
      
      this.isInitialized = true;
      console.log('[NativeTTS] ✅ Native TTS initialized successfully');
    } catch (error) {
      console.error('[NativeTTS] ❌ Failed to initialize:', error);
      // Even if native fails, provide fallback language list
      this.supportedLanguages = [
        'hi-IN', 'en-IN', 'en-US', 'en-GB',
        'mr-IN', 'ta-IN', 'te-IN', 'bn-IN', 
        'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN'
      ];
      this.isInitialized = true; // Mark as initialized to prevent infinite waiting
    }
  }

  /**
   * Wait for initialization to complete
   */
  async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
    
    // Extra timeout protection
    if (!this.isInitialized) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Get the best language code for TTS
   * IMPORTANT: Indian languages should NEVER fall back to English directly
   * Fallback chain: Requested → Same script family → Hindi → English
   */
  getLanguageCode(language: string): { code: string; isFallback: boolean; originalCode: string } {
    const baseLang = language.split('-')[0].toLowerCase();
    const originalCode = ALL_INDIAN_LANGUAGES[baseLang]?.code || ALL_INDIAN_LANGUAGES[language]?.code || `${baseLang}-IN`;
    const isNative = Capacitor.isNativePlatform();
    const langInfo = ALL_INDIAN_LANGUAGES[baseLang];
    
    console.log(`[NativeTTS] 🔍 Language resolution:`, {
      requested: language,
      baseLang,
      originalCode,
      platform: isNative ? 'native' : 'browser/PWA',
      langName: langInfo?.name || 'Unknown'
    });
    
    // Check if device supports this language
    const isSupported = this.supportedLanguages.some(sl => 
      sl.toLowerCase() === originalCode.toLowerCase() || 
      sl.toLowerCase().startsWith(baseLang.toLowerCase())
    );
    
    if (isSupported) {
      console.log(`[NativeTTS] ✅ Using requested language: ${originalCode}`);
      return { code: originalCode, isFallback: false, originalCode };
    }
    
    // Check if this is an Indian language (should use Hindi fallback, not English)
    const isIndianLanguage = baseLang in ALL_INDIAN_LANGUAGES && 
                             !['en', 'en-US', 'en-GB', 'en-IN'].includes(baseLang);
    
    // Try fallback language from our mapping
    const fallbackCode = FALLBACK_LANGUAGES[baseLang];
    if (fallbackCode) {
      const fallbackBaseLang = fallbackCode.split('-')[0].toLowerCase();
      const fallbackSupported = this.supportedLanguages.some(sl => 
        sl.toLowerCase() === fallbackCode.toLowerCase() ||
        sl.toLowerCase().startsWith(fallbackBaseLang)
      );
      
      if (fallbackSupported) {
        console.log(`[NativeTTS] 🔄 Using fallback: ${baseLang} (${langInfo?.name}) → ${fallbackCode}`);
        return { code: fallbackCode, isFallback: true, originalCode };
      }
    }
    
    // For Indian languages: ALWAYS try Hindi before English
    if (isIndianLanguage) {
      const hindiSupported = this.supportedLanguages.some(sl => 
        sl.toLowerCase().startsWith('hi')
      );
      
      if (hindiSupported) {
        console.log(`[NativeTTS] 🇮🇳 Indian language fallback to Hindi: ${baseLang} (${langInfo?.name}) → hi-IN`);
        return { code: 'hi-IN', isFallback: true, originalCode };
      }
      
      // Even if Hindi isn't in supported list, TRY Hindi anyway for Indian languages
      // The TTS engine may still support it even if not reported
      console.log(`[NativeTTS] 🇮🇳 Forcing Hindi for Indian language: ${baseLang} (${langInfo?.name}) → hi-IN (may work)`);
      return { code: 'hi-IN', isFallback: true, originalCode };
    }
    
    // Only for non-Indian languages, fall back to English
    console.log(`[NativeTTS] Final fallback to English for: ${baseLang}`);
    return { code: 'en-IN', isFallback: true, originalCode };
  }

  /**
   * Check if native TTS is available
   */
  isNativeAvailable(): boolean {
    return !!this.nativeTTS;
  }

  /**
   * Main speak method - NATIVE ONLY (for APK)
   */
  async speak(
    text: string, 
    language: string = 'hi',
    config: Partial<TTSConfig> = {},
    callbacks: TTSCallbacks = {}
  ): Promise<TTSResult> {
    const startTime = performance.now();
    
    if (!text?.trim()) {
      console.warn('[NativeTTS] No text provided');
      return { success: false, provider: 'none', error: 'No text provided' };
    }

    await this.ensureInitialized();

    // Generate new request ID
    const requestId = ++this.currentRequestId;
    
    // Stop any current playback with a small delay to prevent race conditions
    if (this.isPlaying) {
      this.stop();
      // Small delay to allow stop to complete
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.currentCallbacks = callbacks;
    const langInfo = this.getLanguageCode(language);
    const { rate = 1.0, pitch = 1.0, volume = 1.0 } = config;

    console.log(`[NativeTTS] 🎤 Starting speech:`, {
      requestId,
      requested: language,
      using: langInfo.code,
      isFallback: langInfo.isFallback,
      textLength: text.length
    });

    // Check if native TTS is available
    if (!this.nativeTTS) {
      const error = 'Native TTS not available. Please ensure TTS is installed on your device.';
      console.error('[NativeTTS] ❌', error);
      callbacks.onError?.(new Error(error));
      return { 
        success: false, 
        provider: 'none', 
        error,
        requestedLanguage: language,
        usedLanguage: langInfo.code
      };
    }

    try {
      // Call onStart immediately for instant UI feedback
      this.isPlaying = true;
      this.isStopping = false;
      callbacks.onStart?.();

      // Speak using native TTS
      await this.nativeTTS.speak({
        text: text.trim(),
        lang: langInfo.code,
        rate: Math.max(0.5, Math.min(2.0, rate)),
        pitch: Math.max(0.5, Math.min(2.0, pitch)),
        volume: Math.max(0.0, Math.min(1.0, volume)),
        category: 'ambient', // Allow mixing with other audio
      });

      // Check if this request is still valid and wasn't stopped
      if (requestId === this.currentRequestId && !this.isStopping) {
        this.isPlaying = false;
        callbacks.onEnd?.();
        console.log('[NativeTTS] ✅ Speech completed successfully');
      }

      return { 
        success: true, 
        provider: 'native',
        startTime: performance.now() - startTime,
        requestedLanguage: language,
        usedLanguage: langInfo.code
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Check if this was an intentional stop (interrupted)
      const isInterrupted = 
        this.isStopping ||
        errorMsg.toLowerCase().includes('interrupt') ||
        errorMsg.toLowerCase().includes('cancel') ||
        errorMsg.toLowerCase().includes('aborted');
      
      if (isInterrupted) {
        console.log('[NativeTTS] Speech interrupted (expected)');
        // Don't call onError for intentional interruptions
        this.isPlaying = false;
        return { 
          success: true, // Consider interruption as "successful stop"
          provider: 'native',
          startTime: performance.now() - startTime,
          requestedLanguage: language,
          usedLanguage: langInfo.code
        };
      }
      
      this.isPlaying = false;
      console.error('[NativeTTS] ❌ Speak error:', errorMsg);
      
      if (requestId === this.currentRequestId) {
        callbacks.onError?.(new Error(errorMsg));
      }
      
      return { 
        success: false, 
        provider: 'native', 
        error: errorMsg,
        startTime: performance.now() - startTime,
        requestedLanguage: language,
        usedLanguage: langInfo.code
      };
    }
  }

  /**
   * Stop current playback
   */
  stop(): void {
    console.log('[NativeTTS] Stop requested');
    this.isStopping = true;
    this.currentRequestId++; // Invalidate any pending callbacks
    
    if (this.nativeTTS) {
      try {
        this.nativeTTS.stop();
      } catch (e) {
        // Ignore stop errors
      }
    }

    this.isPlaying = false;
    this.currentCallbacks = {};
  }

  /**
   * Pause is not supported on native TTS
   */
  pause(): void {
    console.warn('[NativeTTS] Pause not supported on native TTS');
  }

  /**
   * Resume is not supported on native TTS
   */
  resume(): void {
    console.warn('[NativeTTS] Resume not supported on native TTS');
  }

  /**
   * Check if currently speaking
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get all supported Indian languages
   */
  getSupportedLanguages(): Array<{ code: string; name: string; nativeName: string }> {
    return Object.entries(ALL_INDIAN_LANGUAGES).map(([key, value]) => ({
      code: value.code,
      name: value.name,
      nativeName: value.nativeName,
    }));
  }

  /**
   * Get device-available languages
   */
  getDeviceLanguages(): string[] {
    return [...this.supportedLanguages];
  }

  /**
   * Check if language is supported
   */
  isLanguageSupported(language: string): boolean {
    const baseLang = language.split('-')[0].toLowerCase();
    return baseLang in ALL_INDIAN_LANGUAGES || language in ALL_INDIAN_LANGUAGES;
  }

  /**
   * Check if language is available on device
   */
  isLanguageAvailableOnDevice(language: string): boolean {
    const baseLang = language.split('-')[0].toLowerCase();
    return this.supportedLanguages.some(sl => 
      sl.toLowerCase() === language.toLowerCase() ||
      sl.toLowerCase().startsWith(baseLang)
    );
  }

  /**
   * Get language display info
   */
  getLanguageInfo(language: string): { name: string; nativeName: string } | null {
    const baseLang = language.split('-')[0].toLowerCase();
    return ALL_INDIAN_LANGUAGES[baseLang] || ALL_INDIAN_LANGUAGES[language] || null;
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

// Export language constants
export { ALL_INDIAN_LANGUAGES, FALLBACK_LANGUAGES };
