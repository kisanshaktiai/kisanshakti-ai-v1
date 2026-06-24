/**
 * Enhanced Native TTS Service with Natural Voice Quality
 * Features:
 * - High-quality voice selection (WaveNet/Neural voices)
 * - Text preprocessing for natural speech
 * - Smart voice detection and user prompts
 * - Optimized voice settings for clarity
 */

import { Capacitor } from '@capacitor/core';

// ============= VOICE QUALITY TYPES =============
export type VoiceQuality = 'premium' | 'enhanced' | 'standard' | 'basic';

export interface VoiceInfo {
  identifier: string;
  name: string;
  language: string;
  quality: VoiceQuality;
  isNeural: boolean;
}

export interface VoicePreferences {
  rate: number;       // 0.5 - 2.0 (default: 0.9 for clarity)
  pitch: number;      // 0.5 - 2.0 (default: 1.0 natural)
  volume: number;     // 0.0 - 1.0 (default: 0.9)
}

// ============= PREFERRED VOICES FOR INDIAN LANGUAGES =============
// Prioritized list of high-quality voices for each language
const PREFERRED_VOICES: Record<string, string[]> = {
  // English (India) - Prefer neural/enhanced voices
  'en-IN': [
    'en-IN-Wavenet-A', 'en-IN-Wavenet-B', 'en-IN-Wavenet-C', 'en-IN-Wavenet-D',
    'en-IN-Neural2-A', 'en-IN-Neural2-B', 'en-IN-Neural2-C', 'en-IN-Neural2-D',
    'en-in-x-enc-network', 'en-in-x-end-network', 'en-in-x-ena-network',
    'Rishi', 'Veena', 'Lekha', // Apple voices
    'Microsoft Ravi', 'Microsoft Heera', // Microsoft voices
  ],
  // Hindi - Best neural voices
  'hi-IN': [
    'hi-IN-Wavenet-A', 'hi-IN-Wavenet-B', 'hi-IN-Wavenet-C', 'hi-IN-Wavenet-D',
    'hi-IN-Neural2-A', 'hi-IN-Neural2-B', 'hi-IN-Neural2-C', 'hi-IN-Neural2-D',
    'hi-in-x-hia-network', 'hi-in-x-hib-network', 'hi-in-x-hic-network',
    'Lekha', 'Kiyara', // Apple voices
    'Microsoft Kalpana', 'Microsoft Hemant',
  ],
  // Marathi
  'mr-IN': [
    'mr-IN-Wavenet-A', 'mr-IN-Wavenet-B',
    'mr-in-x-mra-network', 'mr-in-x-mrb-network',
  ],
  // Tamil
  'ta-IN': [
    'ta-IN-Wavenet-A', 'ta-IN-Wavenet-B', 'ta-IN-Wavenet-C', 'ta-IN-Wavenet-D',
    'ta-in-x-taa-network', 'ta-in-x-tab-network',
  ],
  // Telugu
  'te-IN': [
    'te-IN-Wavenet-A', 'te-IN-Wavenet-B',
    'te-in-x-tea-network', 'te-in-x-teb-network',
  ],
  // Bengali
  'bn-IN': [
    'bn-IN-Wavenet-A', 'bn-IN-Wavenet-B',
    'bn-in-x-bna-network', 'bn-in-x-bnb-network',
  ],
  // Gujarati
  'gu-IN': [
    'gu-IN-Wavenet-A', 'gu-IN-Wavenet-B',
    'gu-in-x-gua-network', 'gu-in-x-gub-network',
  ],
  // Kannada
  'kn-IN': [
    'kn-IN-Wavenet-A', 'kn-IN-Wavenet-B',
    'kn-in-x-kna-network', 'kn-in-x-knb-network',
  ],
  // Malayalam
  'ml-IN': [
    'ml-IN-Wavenet-A', 'ml-IN-Wavenet-B',
    'ml-in-x-mla-network', 'ml-in-x-mlb-network',
  ],
  // Punjabi
  'pa-IN': [
    'pa-IN-Wavenet-A', 'pa-IN-Wavenet-B',
    'pa-in-x-paa-network', 'pa-in-x-pab-network',
  ],
};

// ============= VOICE QUALITY INDICATORS =============
const QUALITY_INDICATORS = {
  premium: ['wavenet', 'neural2', 'neural', 'premium', 'hd'],
  enhanced: ['network', 'enhanced', 'high', 'quality'],
  standard: ['standard', 'default'],
  basic: ['basic', 'compact', 'local']
};

// ============= ALL INDIAN LANGUAGES =============
const ALL_INDIAN_LANGUAGES: Record<string, { code: string; name: string; nativeName: string }> = {
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
  'en': { code: 'en-IN', name: 'English (India)', nativeName: 'English' },
};

// ============= TEXT PREPROCESSING =============
class TextPreprocessor {
  // Convert numbers to words for better pronunciation
  static numberToWords(num: number, language: string = 'en'): string {
    const englishWords: Record<number, string> = {
      0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four',
      5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine',
      10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen',
      15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen',
      20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty',
      60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety',
      100: 'hundred', 1000: 'thousand', 100000: 'lakh', 10000000: 'crore'
    };

    const hindiWords: Record<number, string> = {
      0: 'शून्य', 1: 'एक', 2: 'दो', 3: 'तीन', 4: 'चार',
      5: 'पाँच', 6: 'छह', 7: 'सात', 8: 'आठ', 9: 'नौ',
      10: 'दस', 11: 'ग्यारह', 12: 'बारह', 13: 'तेरह', 14: 'चौदह',
      15: 'पंद्रह', 16: 'सोलह', 17: 'सत्रह', 18: 'अठारह', 19: 'उन्नीस',
      20: 'बीस', 30: 'तीस', 40: 'चालीस', 50: 'पचास',
      60: 'साठ', 70: 'सत्तर', 80: 'अस्सी', 90: 'नब्बे',
      100: 'सौ', 1000: 'हज़ार', 100000: 'लाख', 10000000: 'करोड़'
    };

    const words = language.startsWith('hi') ? hindiWords : englishWords;
    
    if (num in words) return words[num];
    if (num < 100) {
      const tens = Math.floor(num / 10) * 10;
      const ones = num % 10;
      return `${words[tens]} ${ones > 0 ? words[ones] : ''}`.trim();
    }
    // For larger numbers, keep as-is for TTS to handle
    return num.toString();
  }

  // Add natural pauses by inserting commas for long sentences
  static addNaturalPauses(text: string): string {
    const sentences = text.split(/([.!?।॥]+)/);
    return sentences.map(sentence => {
      if (sentence.match(/[.!?।॥]+/)) return sentence;
      
      const words = sentence.split(/\s+/);
      if (words.length <= 12) return sentence;
      
      // Insert commas every 10-12 words for breathing pauses
      const result: string[] = [];
      for (let i = 0; i < words.length; i++) {
        result.push(words[i]);
        if ((i + 1) % 10 === 0 && i < words.length - 1) {
          // Don't add comma if word already ends with punctuation
          if (!words[i].match(/[,;:।॥]$/)) {
            result[result.length - 1] += ',';
          }
        }
      }
      return result.join(' ');
    }).join('');
  }

  // Convert standalone numbers to words
  static convertNumbers(text: string, language: string): string {
    return text.replace(/\b(\d{1,4})\b/g, (match, num) => {
      const n = parseInt(num, 10);
      if (n <= 100 || n === 1000) {
        return this.numberToWords(n, language);
      }
      return match;
    });
  }

  // Break long paragraphs into chunks
  static breakIntoChunks(text: string, maxSentences: number = 3): string[] {
    // Split by sentence endings (multiple scripts supported)
    const sentences = text.split(/(?<=[.!?।॥])\s+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    for (const sentence of sentences) {
      currentChunk.push(sentence);
      if (currentChunk.length >= maxSentences) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    return chunks.filter(c => c.trim().length > 0);
  }

  // Full preprocessing pipeline
  static preprocess(text: string, language: string): string {
    let processed = text.trim();
    
    // Convert numbers for better pronunciation
    processed = this.convertNumbers(processed, language);
    
    // Add natural pauses
    processed = this.addNaturalPauses(processed);
    
    // Clean up multiple spaces
    processed = processed.replace(/\s+/g, ' ');
    
    return processed;
  }
}

// ============= VOICE QUALITY DETECTOR =============
class VoiceQualityDetector {
  private availableVoices: VoiceInfo[] = [];
  private hasCheckedVoices = false;
  private enhancedVoicesAvailable = false;

  async detectVoices(): Promise<VoiceInfo[]> {
    if (this.hasCheckedVoices) return this.availableVoices;

    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      const result = await TextToSpeech.getSupportedVoices();
      
      if (result.voices) {
        this.availableVoices = result.voices.map((v: any) => ({
          identifier: v.voiceURI || v.name || '',
          name: v.name || v.voiceURI || 'Unknown',
          language: v.lang || '',
          quality: this.detectQuality(v.name || v.voiceURI || ''),
          isNeural: this.isNeuralVoice(v.name || v.voiceURI || '')
        }));
        
        this.enhancedVoicesAvailable = this.availableVoices.some(
          v => v.quality === 'premium' || v.quality === 'enhanced'
        );
      }
    } catch (e) {
      console.warn('[VoiceDetector] Could not detect voices:', e);
    }

    this.hasCheckedVoices = true;
    return this.availableVoices;
  }

  private detectQuality(voiceName: string): VoiceQuality {
    const name = voiceName.toLowerCase();
    
    for (const [quality, indicators] of Object.entries(QUALITY_INDICATORS)) {
      if (indicators.some(ind => name.includes(ind))) {
        return quality as VoiceQuality;
      }
    }
    return 'standard';
  }

  private isNeuralVoice(voiceName: string): boolean {
    const name = voiceName.toLowerCase();
    return name.includes('neural') || name.includes('wavenet') || name.includes('network');
  }

  hasEnhancedVoices(): boolean {
    return this.enhancedVoicesAvailable;
  }

  getBestVoiceForLanguage(langCode: string): VoiceInfo | null {
    const langBase = langCode.toLowerCase();
    const languageVoices = this.availableVoices.filter(v => 
      v.language.toLowerCase().startsWith(langBase.split('-')[0])
    );

    if (languageVoices.length === 0) return null;

    // Sort by quality (premium > enhanced > standard > basic)
    const qualityOrder: VoiceQuality[] = ['premium', 'enhanced', 'standard', 'basic'];
    languageVoices.sort((a, b) => 
      qualityOrder.indexOf(a.quality) - qualityOrder.indexOf(b.quality)
    );

    // Check for preferred voices first
    const preferred = PREFERRED_VOICES[langCode] || [];
    for (const prefVoice of preferred) {
      const match = languageVoices.find(v => 
        v.identifier.toLowerCase().includes(prefVoice.toLowerCase()) ||
        v.name.toLowerCase().includes(prefVoice.toLowerCase())
      );
      if (match) return match;
    }

    return languageVoices[0];
  }

  getVoiceDownloadInstructions(): { android: string; ios: string } {
    return {
      android: `To download enhanced voices on Android:
1. Go to Settings → System → Language & Input → Text-to-Speech
2. Tap on "Preferred engine" (usually Google TTS)
3. Tap "Install voice data"
4. Select your language and download "High quality" voices
5. For best results, choose WaveNet or Neural voices if available`,
      ios: `To download enhanced voices on iOS:
1. Go to Settings → Accessibility → Spoken Content → Voices
2. Select your language
3. Download "Enhanced" quality voices
4. For best results, choose "Premium" voices where available`
    };
  }
}

// ============= MAIN ENHANCED TTS SERVICE =============
export interface TTSCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
  onChunkStart?: (chunkIndex: number, totalChunks: number) => void;
}

export interface TTSResult {
  success: boolean;
  error?: string;
  voiceUsed?: string;
  voiceQuality?: VoiceQuality;
  chunksProcessed?: number;
}

class EnhancedNativeTTSService {
  private nativeTTS: any = null;
  private isInitialized = false;
  private isPlaying = false;
  private currentRequestId = 0;
  private isStopping = false;
  private initPromise: Promise<void> | null = null;
  
  private voiceDetector = new VoiceQualityDetector();
  private textPreprocessor = TextPreprocessor;
  
  // Optimized default settings for natural speech
  private defaultPreferences: VoicePreferences = {
    rate: 0.9,    // Slightly slower for clarity
    pitch: 1.0,   // Natural pitch
    volume: 0.9   // Slightly below max for comfort
  };

  private userPreferences: Partial<VoicePreferences> = {};
  private hasPromptedForVoices = false;

  constructor() {
    this.loadUserPreferences();
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    console.log('[EnhancedTTS] Initializing...');
    
    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      this.nativeTTS = TextToSpeech;
      
      // Detect available voices
      await this.voiceDetector.detectVoices();
      
      this.isInitialized = true;
      console.log('[EnhancedTTS] ✅ Initialized, enhanced voices:', this.voiceDetector.hasEnhancedVoices());
    } catch (error) {
      console.error('[EnhancedTTS] ❌ Init failed:', error);
      this.isInitialized = true; // Mark initialized to prevent infinite wait
    }
  }

  async ensureInitialized(): Promise<void> {
    if (this.initPromise) await this.initPromise;
  }

  // ============= USER PREFERENCES =============
  private loadUserPreferences(): void {
    try {
      const saved = localStorage.getItem('tts_preferences');
      if (saved) {
        this.userPreferences = JSON.parse(saved);
      }
      this.hasPromptedForVoices = localStorage.getItem('tts_voice_prompt_dismissed') === 'true';
    } catch (e) {
      console.warn('[EnhancedTTS] Could not load preferences');
    }
  }

  setPreferences(prefs: Partial<VoicePreferences>): void {
    this.userPreferences = { ...this.userPreferences, ...prefs };
    try {
      localStorage.setItem('tts_preferences', JSON.stringify(this.userPreferences));
    } catch (e) {
      console.warn('[EnhancedTTS] Could not save preferences');
    }
  }

  getPreferences(): VoicePreferences {
    return { ...this.defaultPreferences, ...this.userPreferences };
  }

  dismissVoicePrompt(): void {
    this.hasPromptedForVoices = true;
    try {
      localStorage.setItem('tts_voice_prompt_dismissed', 'true');
    } catch (e) {}
  }

  // ============= MAIN SPEAK METHOD =============
  async speak(
    text: string,
    language: string = 'hi',
    callbacks: TTSCallbacks = {},
    overridePrefs?: Partial<VoicePreferences>
  ): Promise<TTSResult> {
    if (!text?.trim()) {
      return { success: false, error: 'No text provided' };
    }

    await this.ensureInitialized();

    const requestId = ++this.currentRequestId;
    
    if (this.isPlaying) {
      this.stop();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isStopping = false;
    
    // Get language code
    const langCode = this.getLanguageCode(language);
    const prefs = { ...this.getPreferences(), ...overridePrefs };
    
    // Get best voice for language
    const bestVoice = this.voiceDetector.getBestVoiceForLanguage(langCode);
    
    console.log('[EnhancedTTS] 🎤 Speaking:', {
      language: langCode,
      voice: bestVoice?.name || 'default',
      quality: bestVoice?.quality || 'unknown',
      rate: prefs.rate,
      textLength: text.length
    });

    // Preprocess text for natural speech
    const processedText = this.textPreprocessor.preprocess(text, language);
    
    // Break into chunks for very long text
    const chunks = processedText.length > 500 
      ? this.textPreprocessor.breakIntoChunks(processedText, 2)
      : [processedText];

    if (!this.nativeTTS) {
      callbacks.onError?.(new Error('TTS not available'));
      return { success: false, error: 'TTS not available' };
    }

    try {
      this.isPlaying = true;
      callbacks.onStart?.();

      let chunksProcessed = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        if (this.isStopping || requestId !== this.currentRequestId) break;
        
        callbacks.onChunkStart?.(i, chunks.length);
        
        await this.nativeTTS.speak({
          text: chunks[i],
          lang: langCode,
          rate: Math.max(0.5, Math.min(2.0, prefs.rate)),
          pitch: Math.max(0.5, Math.min(2.0, prefs.pitch)),
          volume: Math.max(0.0, Math.min(1.0, prefs.volume)),
          category: 'ambient',
        });
        
        chunksProcessed++;
        
        // Small pause between chunks for natural flow
        if (i < chunks.length - 1 && !this.isStopping) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      if (requestId === this.currentRequestId && !this.isStopping) {
        this.isPlaying = false;
        callbacks.onEnd?.();
      }

      return {
        success: true,
        voiceUsed: bestVoice?.name,
        voiceQuality: bestVoice?.quality,
        chunksProcessed
      };

    } catch (error) {
      const isInterrupted = this.isStopping || 
        (error instanceof Error && 
          (error.message.includes('interrupt') || error.message.includes('cancel')));
      
      this.isPlaying = false;
      
      if (!isInterrupted) {
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: String(error) };
      }
      
      return { success: true }; // Interrupted is OK
    }
  }

  // ============= CONTROL METHODS =============
  stop(): void {
    console.log('[EnhancedTTS] Stop');
    this.isStopping = true;
    this.currentRequestId++;
    
    try {
      this.nativeTTS?.stop();
    } catch (e) {}
    
    this.isPlaying = false;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  // ============= VOICE DETECTION =============
  async shouldPromptForVoiceDownload(): Promise<boolean> {
    if (this.hasPromptedForVoices) return false;
    
    await this.ensureInitialized();
    return !this.voiceDetector.hasEnhancedVoices();
  }

  getVoiceDownloadInstructions(): { android: string; ios: string } {
    return this.voiceDetector.getVoiceDownloadInstructions();
  }

  hasEnhancedVoices(): boolean {
    return this.voiceDetector.hasEnhancedVoices();
  }

  // ============= LANGUAGE HELPERS =============
  private getLanguageCode(language: string): string {
    const baseLang = language.split('-')[0].toLowerCase();
    return ALL_INDIAN_LANGUAGES[baseLang]?.code || `${baseLang}-IN`;
  }

  getSupportedLanguages(): Array<{ code: string; name: string; nativeName: string }> {
    return Object.values(ALL_INDIAN_LANGUAGES);
  }
}

// Export singleton
export const enhancedTTSService = new EnhancedNativeTTSService();

// Convenience exports
export { TextPreprocessor, VoiceQualityDetector };
