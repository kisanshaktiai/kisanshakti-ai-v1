import { ASRResult, TTSOptions, VoiceConfig, VoiceMetrics, ASRProvider } from './types';
import { IntentMatcher } from './intentMatcher';
import { VoiceAnalytics } from './voiceAnalytics';

export class VoiceService {
  private config: VoiceConfig;
  private intentMatcher: IntentMatcher;
  private analytics: VoiceAnalytics;
  private recognition: any = null;
  private synthesis: SpeechSynthesis;
  private isOnline: boolean = navigator.onLine;

  constructor(config: VoiceConfig) {
    this.config = config;
    this.intentMatcher = new IntentMatcher();
    this.analytics = new VoiceAnalytics(config);
    this.synthesis = window.speechSynthesis;

    // Load intents for current language
    this.intentMatcher.loadIntents(config.language);

    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  async initializeASR(): Promise<void> {
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
    };
    return langMap[this.config.language] || 'en-US';
  }

  async startListening(
    onResult: (result: ASRResult) => void,
    onEnd: () => void
  ): Promise<void> {
    if (!this.recognition) {
      await this.initializeASR();
    }

    const startTime = Date.now();
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
      onEnd();
    };

    this.recognition.start();
  }

  stopListening(): void {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  async speak(options: TTSOptions): Promise<void> {
    const startTime = Date.now();

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
    await this.intentMatcher.loadIntents(language);
    
    if (this.recognition) {
      this.recognition.lang = this.getLanguageCode();
    }
  }

  getIntentMatcher(): IntentMatcher {
    return this.intentMatcher;
  }

  getAnalytics(): VoiceAnalytics {
    return this.analytics;
  }

  isSupported(): boolean {
    const SpeechRecognition = (window as any).SpeechRecognition || 
                             (window as any).webkitSpeechRecognition;
    return !!(SpeechRecognition && window.speechSynthesis);
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
