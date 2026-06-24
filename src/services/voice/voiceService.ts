import { ASRResult, TTSOptions, VoiceConfig, VoiceMetrics, ASRProvider } from './types';
import { DatabaseIntentMatcher } from './databaseIntentMatcher';
import { VoiceAnalytics } from './voiceAnalytics';
import { DialogManager } from './DialogManager';
import { SlotExtractor } from './SlotExtractor';
import { LanguageDetector } from './LanguageDetector';
import { getVoicePlatformInfo, VoicePlatformInfo } from './voicePlatformDetector';
import { 
  shouldUseCapacitorSpeech, 
  startCapacitorListening, 
  stopCapacitorListening,
  requestSpeechPermission,
  initCapacitorSpeechRecognition 
} from './capacitorSpeechRecognition';
import { Capacitor } from '@capacitor/core';

export class VoiceService {
  private config: VoiceConfig;
  private intentMatcher: DatabaseIntentMatcher;
  private analytics: VoiceAnalytics;
  private dialogManager: DialogManager;
  private slotExtractor: SlotExtractor;
  private languageDetector: LanguageDetector;
  private tenantId: string = '';
  private recognition: any = null;
  private synthesis: SpeechSynthesis;
  private isOnline: boolean = navigator.onLine;
  private lastSpokenText: string = '';
  private useNativeSpeech: boolean = false;
  private capacitorInitialized: boolean = false;

  constructor(config: VoiceConfig, tenantId?: string) {
    this.config = config;
    this.tenantId = tenantId || '';
    this.intentMatcher = new DatabaseIntentMatcher();
    this.analytics = new VoiceAnalytics(config);
    this.dialogManager = new DialogManager();
    this.slotExtractor = new SlotExtractor(config.language);
    this.languageDetector = new LanguageDetector();
    this.synthesis = window.speechSynthesis;
    
    // Check if we should use native speech recognition
    this.useNativeSpeech = shouldUseCapacitorSpeech();
    if (this.useNativeSpeech) {
      console.log('[VoiceService] Will use Capacitor native speech recognition');
      this.initCapacitor();
    }

    // Load intents for current language
    if (this.tenantId) {
      this.intentMatcher.loadIntents(config.language, this.tenantId);
    }

    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  private async initCapacitor(): Promise<void> {
    try {
      this.capacitorInitialized = await initCapacitorSpeechRecognition();
      if (this.capacitorInitialized) {
        // Request permission on init for native apps
        await requestSpeechPermission();
      }
    } catch (error) {
      console.error('[VoiceService] Capacitor init error:', error);
    }
  }

  async initializeASR(): Promise<void> {
    // For native platforms, use Capacitor Speech Recognition
    if (this.useNativeSpeech && this.capacitorInitialized) {
      console.log('[VoiceService] Using Capacitor native speech recognition');
      return;
    }
    
    // For web, use Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || 
                             (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error('Speech recognition not supported');
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = this.getLanguageCode();
  }

  private getLanguageCode(): string {
    const langMap: Record<string, string> = {
      'en': 'en-US',
      'hi': 'hi-IN',
      'mr': 'mr-IN',
      'ta': 'ta-IN',
      'pa': 'pa-IN',
      'te': 'te-IN',
      'bn': 'bn-IN',
      'gu': 'gu-IN',
      'kn': 'kn-IN',
      'ml': 'ml-IN',
      'or': 'or-IN',
      'as': 'as-IN',
      'ur': 'ur-IN',
      'sa': 'sa-IN',
    };
    return langMap[this.config.language] || 'en-US';
  }

  async startListening(
    onResult: (result: ASRResult) => void,
    onEnd: () => void
  ): Promise<void> {
    const startTime = Date.now();
    
    // For native platforms, use Capacitor Speech Recognition
    if (this.useNativeSpeech) {
      console.log('[VoiceService] Starting Capacitor speech recognition');
      
      const success = await startCapacitorListening(
        this.config.language,
        (capResult) => {
          const result: ASRResult = {
            transcript: capResult.transcript,
            confidence: capResult.confidence,
            isFinal: capResult.isFinal,
            language: this.config.language,
            provider: 'browser', // Using 'browser' type for compatibility
          };
          onResult(result);
          
          if (capResult.isFinal) {
            const latency = Date.now() - startTime;
            const utterance = this.intentMatcher.matchIntent(capResult.transcript, !this.isOnline);
            if (utterance) {
              this.analytics.recordMetric({
                asrLatency: latency,
                intentAccuracy: utterance.confidence,
                ttsLatency: 0,
                language: this.config.language,
                offline: !this.isOnline,
                timestamp: Date.now(),
              });
            }
          }
        },
        onEnd
      );
      
      if (!success) {
        console.error('[VoiceService] Failed to start Capacitor speech recognition');
        onEnd();
      }
      return;
    }
    
    // For web, use Web Speech API
    if (!this.recognition) {
      await this.initializeASR();
    }

    // Check if already listening to prevent duplicate starts
    if (this.recognition && this.recognition.started) {
      console.warn('[VoiceService] Recognition already started, skipping');
      return;
    }

    const provider: ASRProvider = this.isOnline && this.config.asrProvider === 'hybrid' 
      ? 'browser' 
      : 'offline';

    this.recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join('');

      const isFinal = event.results[event.results.length - 1].isFinal;
      const confidence = event.results[event.results.length - 1][0].confidence || 0.9;

      const result: ASRResult = {
        transcript,
        confidence,
        isFinal,
        language: this.config.language,
        provider,
      };

      onResult(result);

      if (isFinal) {
        const latency = Date.now() - startTime;
        
        // Match intent
        const utterance = this.intentMatcher.matchIntent(transcript, !this.isOnline);
        
        if (utterance) {
          this.analytics.recordMetric({
            asrLatency: latency,
            intentAccuracy: utterance.confidence,
            ttsLatency: 0,
            language: this.config.language,
            offline: !this.isOnline,
            timestamp: Date.now(),
          });
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('ASR error:', event.error);
      onEnd();
    };

    this.recognition.onend = () => {
      this.recognition.started = false;
      onEnd();
    };

    this.recognition.onstart = () => {
      this.recognition.started = true;
    };

    try {
      this.recognition.start();
    } catch (error) {
      console.error('[VoiceService] Error starting recognition:', error);
      onEnd();
    }
  }

  stopListening(): void {
    // For native platforms, use Capacitor Speech Recognition
    if (this.useNativeSpeech) {
      stopCapacitorListening().catch(error => {
        console.error('[VoiceService] Error stopping Capacitor recognition:', error);
      });
      return;
    }
    
    // For web, use Web Speech API
    if (this.recognition) {
      try {
        this.recognition.stop();
        this.recognition.started = false;
      } catch (error) {
        console.error('[VoiceService] Error stopping recognition:', error);
      }
    }
  }

  async speak(options: TTSOptions): Promise<void> {
    const startTime = Date.now();
    this.lastSpokenText = options.text;

    return new Promise((resolve, reject) => {
      if (options.ssml) {
        // Handle SSML if needed
        // For now, strip SSML tags and speak plain text
        options.text = options.text.replace(/<[^>]*>/g, '');
      }

      const utterance = new SpeechSynthesisUtterance(options.text);
      utterance.lang = this.getLanguageCode();
      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;

      // Select voice if specified
      if (options.voice) {
        const voices = this.synthesis.getVoices();
        const voice = voices.find(v => v.name === options.voice);
        if (voice) {
          utterance.voice = voice;
        }
      }

      utterance.onend = () => {
        const latency = Date.now() - startTime;
        this.analytics.recordMetric({
          asrLatency: 0,
          intentAccuracy: 0,
          ttsLatency: latency,
          language: this.config.language,
          offline: !this.isOnline,
          timestamp: Date.now(),
        });
        resolve();
      };

      utterance.onerror = (error) => {
        console.error('TTS error:', error);
        reject(error);
      };

      this.synthesis.speak(utterance);
    });
  }

  stopSpeaking(): void {
    this.synthesis.cancel();
  }

  async changeLanguage(language: string): Promise<void> {
    this.config.language = language;
    this.slotExtractor.setLanguage(language);
    
    if (this.tenantId) {
      await this.intentMatcher.loadIntents(language, this.tenantId);
    }
    
    if (this.recognition) {
      this.recognition.lang = this.getLanguageCode();
    }
  }

  getIntentMatcher(): DatabaseIntentMatcher {
    return this.intentMatcher;
  }

  getDialogManager(): DialogManager {
    return this.dialogManager;
  }

  getSlotExtractor(): SlotExtractor {
    return this.slotExtractor;
  }

  getLanguageDetector(): LanguageDetector {
    return this.languageDetector;
  }

  getAnalytics(): VoiceAnalytics {
    return this.analytics;
  }

  getLastSpokenText(): string {
    return this.lastSpokenText;
  }

  /**
   * Auto-detect language from transcript
   */
  detectLanguage(transcript: string): string {
    const detection = this.languageDetector.detectLanguage(transcript);
    return detection.primaryLanguage;
  }

  /**
   * Check if transcript is code-switching (mixed languages)
   */
  isCodeSwitching(transcript: string): boolean {
    const detection = this.languageDetector.detectLanguage(transcript);
    return detection.isCodeSwitching;
  }

  /**
   * Check if voice recognition is supported
   * Uses comprehensive platform detection for web, native, and WebView environments
   */
  isSupported(): boolean {
    const platformInfo = this.getPlatformInfo();
    
    console.log('[VoiceService] Platform support check:', {
      platform: platformInfo.platform,
      isNative: platformInfo.isNative,
      hasBrowserAPI: platformInfo.hasBrowserSpeechAPI,
      isWebView: platformInfo.isWebView,
      browser: platformInfo.browserName,
      isSupported: platformInfo.isSupported,
      reason: platformInfo.unsupportedReason
    });
    
    return platformInfo.isSupported;
  }

  /**
   * Get detailed platform information for voice support
   */
  getPlatformInfo(): VoicePlatformInfo {
    return getVoicePlatformInfo();
  }

  getConfig(): VoiceConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...updates };
    
    if (updates.language) {
      this.changeLanguage(updates.language);
    }
  }
}
