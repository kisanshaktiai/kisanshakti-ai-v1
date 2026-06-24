/**
 * Kokoro TTS Service - High-quality offline TTS for Hindi & English
 * Uses kokoro-js library with ONNX models
 */

import { KokoroTTS } from 'kokoro-js';

// Available Kokoro voices
export const KOKORO_VOICES = {
  en: {
    // American English voices
    'af_heart': { name: 'Heart', gender: 'female', quality: 'A', lang: 'en-US' },
    'af_bella': { name: 'Bella', gender: 'female', quality: 'A-', lang: 'en-US' },
    'af_nicole': { name: 'Nicole', gender: 'female', quality: 'B-', lang: 'en-US' },
    'af_sarah': { name: 'Sarah', gender: 'female', quality: 'C+', lang: 'en-US' },
    'am_michael': { name: 'Michael', gender: 'male', quality: 'C+', lang: 'en-US' },
    'am_fenrir': { name: 'Fenrir', gender: 'male', quality: 'C+', lang: 'en-US' },
    // British English voices
    'bf_emma': { name: 'Emma', gender: 'female', quality: 'B', lang: 'en-GB' },
    'bm_george': { name: 'George', gender: 'male', quality: 'B-', lang: 'en-GB' },
  },
  hi: {
    // Hindi voices
    'hf_alpha': { name: 'Alpha', gender: 'female', quality: 'C', lang: 'hi-IN' },
    'hf_beta': { name: 'Beta', gender: 'female', quality: 'C', lang: 'hi-IN' },
    'hm_omega': { name: 'Omega', gender: 'male', quality: 'C', lang: 'hi-IN' },
    'hm_psi': { name: 'Psi', gender: 'male', quality: 'C', lang: 'hi-IN' },
  }
} as const;

// Default voices per language
export const DEFAULT_KOKORO_VOICE = {
  en: 'af_heart',
  hi: 'hf_alpha',
} as const;

// Languages supported by Kokoro
export const KOKORO_SUPPORTED_LANGUAGES = ['en', 'hi'] as const;
export type KokoroLanguage = typeof KOKORO_SUPPORTED_LANGUAGES[number];

interface KokoroConfig {
  dtype: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
  device: 'wasm' | 'webgpu';
}

interface TTSCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
}

class KokoroTTSService {
  private tts: KokoroTTS | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private modelLoaded = false;
  private loadProgress = 0;

  // Model ID for Kokoro - quantized for smaller size
  private readonly MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
  
  // Default config - use q8 for balance of quality and size (~80MB)
  private config: KokoroConfig = {
    dtype: 'q8',
    device: 'wasm', // wasm is more compatible than webgpu
  };

  constructor() {
    console.log('[KokoroTTS] Service created');
  }

  /**
   * Check if Kokoro supports a language
   */
  isLanguageSupported(language: string): boolean {
    const langCode = language.split('-')[0].toLowerCase();
    return KOKORO_SUPPORTED_LANGUAGES.includes(langCode as KokoroLanguage);
  }

  /**
   * Get the language code for Kokoro
   */
  getLanguageCode(language: string): KokoroLanguage | null {
    const langCode = language.split('-')[0].toLowerCase();
    if (KOKORO_SUPPORTED_LANGUAGES.includes(langCode as KokoroLanguage)) {
      return langCode as KokoroLanguage;
    }
    return null;
  }

  /**
   * Get voices for a language
   */
  getVoicesForLanguage(language: string): typeof KOKORO_VOICES[KokoroLanguage] | null {
    const langCode = this.getLanguageCode(language);
    if (langCode) {
      return KOKORO_VOICES[langCode];
    }
    return null;
  }

  /**
   * Get the default voice for a language
   */
  getDefaultVoice(language: string): string | null {
    const langCode = this.getLanguageCode(language);
    if (langCode) {
      return DEFAULT_KOKORO_VOICE[langCode];
    }
    return null;
  }

  /**
   * Initialize the Kokoro TTS model
   * This downloads the model on first use (~80MB for q8)
   */
  async initialize(onProgress?: (progress: number) => void): Promise<boolean> {
    if (this.tts && this.modelLoaded) {
      console.log('[KokoroTTS] Already initialized');
      return true;
    }

    if (this.initPromise) {
      console.log('[KokoroTTS] Initialization in progress, waiting...');
      await this.initPromise;
      return this.modelLoaded;
    }

    this.isInitializing = true;
    this.initPromise = this._doInitialize(onProgress);
    
    try {
      await this.initPromise;
      return this.modelLoaded;
    } finally {
      this.isInitializing = false;
      this.initPromise = null;
    }
  }

  private async _doInitialize(onProgress?: (progress: number) => void): Promise<void> {
    try {
      console.log('[KokoroTTS] Initializing with config:', this.config);
      console.log('[KokoroTTS] Loading model:', this.MODEL_ID);
      
      onProgress?.(5);
      this.loadProgress = 5;

      // Load the model
      this.tts = await KokoroTTS.from_pretrained(this.MODEL_ID, {
        dtype: this.config.dtype,
        device: this.config.device,
        progress_callback: (progress: any) => {
          if (progress && typeof progress.loaded === 'number' && typeof progress.total === 'number') {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            this.loadProgress = percent;
            onProgress?.(percent);
            console.log(`[KokoroTTS] Loading: ${percent}%`);
          }
        },
      });

      this.modelLoaded = true;
      this.loadProgress = 100;
      onProgress?.(100);
      
      console.log('[KokoroTTS] Model loaded successfully');
      
      // List available voices
      if (this.tts) {
        const voices = await this.tts.list_voices();
        console.log('[KokoroTTS] Available voices:', voices);
      }
    } catch (error) {
      console.error('[KokoroTTS] Failed to initialize:', error);
      this.modelLoaded = false;
      throw error;
    }
  }

  /**
   * Speak text using Kokoro TTS
   */
  async speak(
    text: string,
    language: string = 'en',
    voiceId?: string,
    callbacks?: TTSCallbacks
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Initialize if needed
      if (!this.tts || !this.modelLoaded) {
        console.log('[KokoroTTS] Model not loaded, initializing...');
        await this.initialize();
      }

      if (!this.tts) {
        throw new Error('Failed to initialize Kokoro TTS');
      }

      // Get language code
      const langCode = this.getLanguageCode(language);
      if (!langCode) {
        throw new Error(`Language ${language} not supported by Kokoro TTS`);
      }

      // Get voice ID
      const voice = voiceId || this.getDefaultVoice(language);
      if (!voice) {
        throw new Error(`No voice available for language ${language}`);
      }

      console.log(`[KokoroTTS] Speaking in ${langCode} with voice ${voice}:`, text.substring(0, 50));
      
      callbacks?.onStart?.();

      // Generate audio - cast voice to any to avoid strict type checking
      const audio = await this.tts.generate(text, { voice: voice as any });
      
      // Play the audio
      await this.playAudio(audio, callbacks);
      
      return { success: true };
    } catch (error) {
      console.error('[KokoroTTS] Error speaking:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      callbacks?.onError?.(error instanceof Error ? error : new Error(errorMsg));
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Play generated audio
   */
  private async playAudio(audio: any, callbacks?: TTSCallbacks): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Get audio data from Kokoro output
        const audioData = audio.toWav ? await audio.toWav() : audio;
        
        // Create audio context if needed
        if (!this.audioContext) {
          this.audioContext = new AudioContext();
        }

        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }

        // Decode audio data
        let audioBuffer: AudioBuffer;
        
        if (audioData instanceof ArrayBuffer) {
          audioBuffer = await this.audioContext.decodeAudioData(audioData);
        } else if (audioData.buffer) {
          audioBuffer = await this.audioContext.decodeAudioData(audioData.buffer);
        } else {
          // Handle raw audio samples
          const samples = audio.audio || audio;
          const sampleRate = audio.sampling_rate || 24000;
          
          audioBuffer = this.audioContext.createBuffer(1, samples.length, sampleRate);
          audioBuffer.copyToChannel(new Float32Array(samples), 0);
        }

        // Stop any current playback
        this.stop();

        // Create and play source
        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = audioBuffer;
        this.currentSource.connect(this.audioContext.destination);
        
        this.currentSource.onended = () => {
          this.currentSource = null;
          callbacks?.onEnd?.();
          resolve();
        };

        this.currentSource.start();
      } catch (error) {
        console.error('[KokoroTTS] Error playing audio:', error);
        callbacks?.onError?.(error instanceof Error ? error : new Error('Audio playback failed'));
        reject(error);
      }
    });
  }

  /**
   * Stop current playback
   */
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {
        // Ignore errors from already stopped source
      }
      this.currentSource = null;
    }
  }

  /**
   * Check if model is loaded
   */
  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  /**
   * Get current load progress
   */
  getLoadProgress(): number {
    return this.loadProgress;
  }

  /**
   * Check if currently initializing
   */
  isInitializingModel(): boolean {
    return this.isInitializing;
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages(): string[] {
    return [...KOKORO_SUPPORTED_LANGUAGES];
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.tts = null;
    this.modelLoaded = false;
  }
}

// Singleton instance
export const kokoroTTSService = new KokoroTTSService();
