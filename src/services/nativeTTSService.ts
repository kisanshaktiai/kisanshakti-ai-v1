/**
 * Native-First TTS Service for Capacitor Android/iOS APK
 * Uses the on-device system speech engine only. No cloud call, no API cost,
 * no farmer text leaves the handset.
 *
 * Language availability is read from the device at runtime via
 * TextToSpeech.getSupportedLanguages(), which on Android is backed by
 * android.speech.tts.TextToSpeech.getAvailableLanguages(). A language is only
 * ever claimed when the device actually reports it.
 */

import { Capacitor } from '@capacitor/core';
import { prepareForSpeech } from '@/services/tts/ttsTextPrepare';

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

/**
 * Writing system per language.
 *
 * FALLBACK_LANGUAGES above states its own rule as "same script family → Hindi
 * → English", but the map cannot express that on its own: it would send Tamil
 * to a Hindi voice and Hindi to an English voice, and a voice cannot read a
 * script it was not built for. This table enforces the rule the map describes —
 * a fallback is only taken when the two languages share a script.
 */
const SCRIPT_BY_LANGUAGE: Record<string, string> = {
  // Devanagari
  'hi': 'deva', 'mr': 'deva', 'mai': 'deva', 'bh': 'deva', 'awa': 'deva',
  'mag': 'deva', 'hne': 'deva', 'raj': 'deva', 'sa': 'deva', 'ne': 'deva',
  'doi': 'deva', 'kok': 'deva', 'gom': 'deva', 'bo': 'deva',
  // Bengali-Assamese
  'bn': 'beng', 'as': 'beng', 'mni': 'beng',
  // Other Indic scripts
  'pa': 'guru', 'gu': 'gujr', 'or': 'orya',
  'ta': 'taml', 'te': 'telu', 'kn': 'knda', 'ml': 'mlym',
  'sat': 'olck',
  // Perso-Arabic
  'ur': 'arab', 'sd': 'arab', 'ks': 'arab',
  // Latin
  'en': 'latn',
};

function scriptOf(language: string): string | null {
  return SCRIPT_BY_LANGUAGE[language.split('-')[0].toLowerCase()] || null;
}

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
  /** Fired before each chunk so the UI can highlight the sentence being read. */
  onChunk?: (index: number, total: number, chunk: string) => void;
}

export type TTSProvider = 'native' | 'none';

export interface TTSResult {
  success: boolean;
  provider: TTSProvider;
  error?: string;
  startTime?: number;
  usedLanguage?: string;
  requestedLanguage?: string;
  /** True when no voice for the requested language or its fallback chain exists on this device. */
  voiceUnavailable?: boolean;
}

export interface LanguageResolution {
  code: string;
  isFallback: boolean;
  originalCode: string;
  /** True only when the device itself reported this code. False means "unverified", never "supported". */
  verified: boolean;
  /** False when the device is known to have no voice anywhere in the fallback chain. */
  available: boolean;
}

/** Maximum hops through FALLBACK_LANGUAGES so a bad map cannot loop. */
const MAX_FALLBACK_HOPS = 4;

/** Rough upper bound on speech duration, used only as a watchdog ceiling. */
const MS_PER_CHAR = 150;
const WATCHDOG_FLOOR_MS = 6000;

class NativeTTSService {
  private nativeTTS: any = null;
  private isInitialized = false;
  private isPlaying = false;
  private currentRequestId = 0;
  private currentCallbacks: TTSCallbacks = {};
  private supportedLanguages: string[] = [];
  /** False when the device never answered. We then try the requested code without claiming support. */
  private deviceLanguagesKnown = false;
  private initPromise: Promise<void> | null = null;
  private isStopping = false;

  constructor() {
    this.initPromise = this.initNativeTTS();
  }

  /**
   * Initialize native TTS plugin and read the device's real voice inventory.
   */
  private async initNativeTTS(): Promise<void> {
    console.log('[NativeTTS] Initializing...');
    console.log('[NativeTTS] Platform:', Capacitor.getPlatform(), 'isNative:', Capacitor.isNativePlatform());

    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      this.nativeTTS = TextToSpeech;

      await this.refreshDeviceLanguages();

      this.isInitialized = true;
      console.log('[NativeTTS] Initialized. Device language inventory known:', this.deviceLanguagesKnown);
    } catch (error) {
      console.error('[NativeTTS] Failed to initialize plugin:', error);
      // No fabricated language list. An unknown inventory stays unknown so the
      // UI can say "voice not confirmed" instead of promising a voice.
      this.supportedLanguages = [];
      this.deviceLanguagesKnown = false;
      this.isInitialized = true;
    }
  }

  /**
   * Re-read the device voice inventory. Call after returning from the system
   * voice-data screen so a newly installed voice is picked up without a restart.
   */
  async refreshDeviceLanguages(): Promise<string[]> {
    if (!this.nativeTTS) return [];

    try {
      const result = await this.nativeTTS.getSupportedLanguages();
      const languages: string[] = Array.isArray(result?.languages) ? result.languages : [];
      this.supportedLanguages = languages;
      this.deviceLanguagesKnown = languages.length > 0;
      console.log('[NativeTTS] Device reported', languages.length, 'languages:', languages.slice(0, 12));
      return languages;
    } catch (e) {
      console.warn('[NativeTTS] Device did not report supported languages:', e);
      this.supportedLanguages = [];
      this.deviceLanguagesKnown = false;
      return [];
    }
  }

  async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /** True when the device reported a voice for this BCP-47 code or its base language. */
  private deviceHas(code: string): boolean {
    const base = code.split('-')[0].toLowerCase();
    return this.supportedLanguages.some((sl) => {
      const s = sl.toLowerCase();
      return s === code.toLowerCase() || s.split('-')[0] === base;
    });
  }

  /**
   * Resolve the code to speak with.
   * Fallbacks are only taken to languages the device actually reported, so the
   * farmer never gets an English voice reading Devanagari text.
   */
  getLanguageCode(language: string): LanguageResolution {
    const baseLang = language.split('-')[0].toLowerCase();
    const originalCode =
      ALL_INDIAN_LANGUAGES[baseLang]?.code || ALL_INDIAN_LANGUAGES[language]?.code || `${baseLang}-IN`;

    // Inventory unknown: try what was asked for, but do not claim it is supported.
    if (!this.deviceLanguagesKnown) {
      return { code: originalCode, isFallback: false, originalCode, verified: false, available: true };
    }

    if (this.deviceHas(originalCode)) {
      return { code: originalCode, isFallback: false, originalCode, verified: true, available: true };
    }

    // Walk the script-family fallback chain. A candidate is only accepted when
    // the device actually reports it AND it uses the same writing system, so a
    // farmer never hears an English voice attempt Devanagari.
    const requestedScript = scriptOf(baseLang);
    let cursor = baseLang;

    for (let hop = 0; hop < MAX_FALLBACK_HOPS; hop++) {
      const next = FALLBACK_LANGUAGES[cursor];
      if (!next) break;

      const nextScript = scriptOf(next);
      if (requestedScript && nextScript && nextScript !== requestedScript) {
        console.warn(
          `[NativeTTS] Refusing ${originalCode} -> ${next}: different script (${requestedScript} vs ${nextScript})`
        );
        break;
      }

      if (this.deviceHas(next)) {
        console.log(`[NativeTTS] Fallback ${originalCode} -> ${next} (device-verified, same script)`);
        return { code: next, isFallback: true, originalCode, verified: true, available: true };
      }

      cursor = next.split('-')[0].toLowerCase();
    }

    // Nothing in the chain exists on this device. Report it instead of guessing.
    console.warn(`[NativeTTS] No device voice for ${originalCode} or its fallback chain`);
    return { code: originalCode, isFallback: false, originalCode, verified: false, available: false };
  }

  isNativeAvailable(): boolean {
    return !!this.nativeTTS;
  }

  /** Whether the device inventory was successfully read. */
  areDeviceLanguagesKnown(): boolean {
    return this.deviceLanguagesKnown;
  }

  /**
   * Speak one chunk, guarded by a watchdog.
   * The plugin resolves its promise from Android's UtteranceProgressListener.
   * If the engine rejects the request outright, no listener callback fires and
   * the promise would never settle, so the watchdog bounds the wait.
   */
  private async speakChunk(chunk: string, lang: string, config: Required<TTSConfig>): Promise<void> {
    const budget = Math.max(WATCHDOG_FLOOR_MS, (chunk.length * MS_PER_CHAR) / config.rate);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const watchdog = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('tts-timeout')), budget);
    });

    try {
      await Promise.race([
        this.nativeTTS.speak({
          text: chunk,
          lang,
          rate: config.rate,
          pitch: config.pitch,
          volume: config.volume,
          category: 'ambient',
        }),
        watchdog,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Main speak method — on-device only.
   * The text is chunked first so no single utterance exceeds the platform
   * speech-input limit, which Android enforces silently.
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

    const requestId = ++this.currentRequestId;

    if (this.isPlaying) {
      this.stop();
      await new Promise((resolve) => setTimeout(resolve, 50));
      this.isStopping = false;
      this.currentRequestId = requestId;
    }

    this.currentCallbacks = callbacks;
    const langInfo = this.getLanguageCode(language);

    const resolved: Required<TTSConfig> = {
      rate: Math.max(0.5, Math.min(2.0, config.rate ?? 1.0)),
      pitch: Math.max(0.5, Math.min(2.0, config.pitch ?? 1.0)),
      volume: Math.max(0.0, Math.min(1.0, config.volume ?? 1.0)),
    };

    if (!this.nativeTTS) {
      const error = 'Native TTS engine not available on this device.';
      console.error('[NativeTTS]', error);
      callbacks.onError?.(new Error(error));
      return {
        success: false,
        provider: 'none',
        error,
        requestedLanguage: language,
        usedLanguage: langInfo.code,
      };
    }

    // Graceful stop: no voice anywhere in the chain. The caller offers the
    // system voice-data installer rather than reading in the wrong language.
    if (!langInfo.available) {
      const error = 'voice-unavailable';
      callbacks.onError?.(new Error(error));
      return {
        success: false,
        provider: 'none',
        error,
        voiceUnavailable: true,
        requestedLanguage: language,
        usedLanguage: langInfo.originalCode,
      };
    }

    const { chunks } = prepareForSpeech(text);
    if (chunks.length === 0) {
      return { success: false, provider: 'none', error: 'No speakable text' };
    }

    console.log('[NativeTTS] Speaking:', {
      requestId,
      requested: language,
      using: langInfo.code,
      isFallback: langInfo.isFallback,
      verified: langInfo.verified,
      chunks: chunks.length,
      chars: text.length,
    });

    try {
      this.isPlaying = true;
      this.isStopping = false;
      callbacks.onStart?.();

      for (let i = 0; i < chunks.length; i++) {
        if (requestId !== this.currentRequestId || this.isStopping) {
          console.log('[NativeTTS] Playback superseded or stopped');
          this.isPlaying = false;
          return {
            success: true,
            provider: 'native',
            startTime: performance.now() - startTime,
            requestedLanguage: language,
            usedLanguage: langInfo.code,
          };
        }

        callbacks.onChunk?.(i, chunks.length, chunks[i]);
        callbacks.onProgress?.(Math.round((i / chunks.length) * 100));

        await this.speakChunk(chunks[i], langInfo.code, resolved);
      }

      if (requestId === this.currentRequestId && !this.isStopping) {
        this.isPlaying = false;
        callbacks.onProgress?.(100);
        callbacks.onEnd?.();
        console.log('[NativeTTS] Playback complete');
      }

      return {
        success: true,
        provider: 'native',
        startTime: performance.now() - startTime,
        requestedLanguage: language,
        usedLanguage: langInfo.code,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      const isInterrupted =
        this.isStopping ||
        errorMsg.toLowerCase().includes('interrupt') ||
        errorMsg.toLowerCase().includes('cancel') ||
        errorMsg.toLowerCase().includes('aborted');

      this.isPlaying = false;

      if (isInterrupted) {
        console.log('[NativeTTS] Speech interrupted (expected)');
        return {
          success: true,
          provider: 'native',
          startTime: performance.now() - startTime,
          requestedLanguage: language,
          usedLanguage: langInfo.code,
        };
      }

      console.error('[NativeTTS] Speak error:', errorMsg);
      if (requestId === this.currentRequestId) {
        callbacks.onError?.(new Error(errorMsg));
      }

      return {
        success: false,
        provider: 'native',
        error: errorMsg,
        startTime: performance.now() - startTime,
        requestedLanguage: language,
        usedLanguage: langInfo.code,
      };
    }
  }

  /**
   * Open the system text-to-speech voice-data screen so the farmer can install
   * the missing voice. This is the graceful path when no offline voice exists.
   */
  async openVoiceInstall(): Promise<boolean> {
    if (!this.nativeTTS?.openInstall) return false;
    try {
      await this.nativeTTS.openInstall();
      return true;
    } catch (e) {
      console.warn('[NativeTTS] Could not open voice installer:', e);
      return false;
    }
  }

  stop(): void {
    console.log('[NativeTTS] Stop requested');
    this.isStopping = true;
    this.currentRequestId++;

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
   * Pause is not supported by the Android speech engine.
   */
  pause(): void {
    console.warn('[NativeTTS] Pause not supported on native TTS');
  }

  /**
   * Resume is not supported by the Android speech engine.
   */
  resume(): void {
    console.warn('[NativeTTS] Resume not supported on native TTS');
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get all Indian languages the app knows about.
   * This is the app's catalogue, not a claim about this device.
   */
  getSupportedLanguages(): Array<{ code: string; name: string; nativeName: string }> {
    return Object.entries(ALL_INDIAN_LANGUAGES).map(([, value]) => ({
      code: value.code,
      name: value.name,
      nativeName: value.nativeName,
    }));
  }

  /** Languages this device actually reported. Empty when the inventory is unknown. */
  getDeviceLanguages(): string[] {
    return [...this.supportedLanguages];
  }

  isLanguageSupported(language: string): boolean {
    const baseLang = language.split('-')[0].toLowerCase();
    return baseLang in ALL_INDIAN_LANGUAGES || language in ALL_INDIAN_LANGUAGES;
  }

  isLanguageAvailableOnDevice(language: string): boolean {
    if (!this.deviceLanguagesKnown) return false;
    return this.deviceHas(language);
  }

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
