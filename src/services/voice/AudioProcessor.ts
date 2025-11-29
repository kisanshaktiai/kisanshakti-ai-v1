/**
 * AudioProcessor - Audio compression and optimization for voice commands
 * Reduces bandwidth usage and improves performance on low-end devices
 */

export interface AudioProcessorConfig {
  sampleRate: number;
  bitRate: number;
  channels: number;
  format: 'webm' | 'wav' | 'mp3';
  enableCompression: boolean;
  compressionLevel: 'low' | 'medium' | 'high';
}

export interface ProcessedAudio {
  blob: Blob;
  duration: number;
  size: number;
  format: string;
  compressionRatio?: number;
}

export class AudioProcessor {
  private config: AudioProcessorConfig;
  private audioContext: AudioContext | null = null;

  constructor(config?: Partial<AudioProcessorConfig>) {
    this.config = {
      sampleRate: 16000, // Lower sample rate for voice (vs 44100 for music)
      bitRate: 32000, // 32 kbps sufficient for voice
      channels: 1, // Mono for voice
      format: 'webm',
      enableCompression: true,
      compressionLevel: 'medium',
      ...config,
    };
  }

  async initialize(): Promise<void> {
    try {
      // Create audio context with optimized sample rate
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });
      console.log('[AudioProcessor] Initialized with sample rate:', this.config.sampleRate);
    } catch (error) {
      console.error('[AudioProcessor] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Compress audio blob to reduce size and bandwidth
   */
  async compressAudio(audioBlob: Blob): Promise<ProcessedAudio> {
    if (!this.config.enableCompression) {
      return {
        blob: audioBlob,
        duration: 0,
        size: audioBlob.size,
        format: audioBlob.type,
      };
    }

    const startTime = performance.now();
    const originalSize = audioBlob.size;

    try {
      // For WebM audio, we can re-encode with lower bitrate
      if (audioBlob.type.includes('webm') || audioBlob.type.includes('ogg')) {
        const compressed = await this.compressWebM(audioBlob);
        const compressionTime = performance.now() - startTime;
        
        console.log('[AudioProcessor] Compression:', {
          originalSize,
          compressedSize: compressed.size,
          ratio: (compressed.size / originalSize).toFixed(2),
          time: compressionTime.toFixed(0) + 'ms',
        });

        return {
          blob: compressed,
          duration: 0,
          size: compressed.size,
          format: 'webm',
          compressionRatio: originalSize / compressed.size,
        };
      }

      // For other formats, convert to optimized WebM
      return await this.convertAndCompress(audioBlob);
    } catch (error) {
      console.error('[AudioProcessor] Compression failed, using original:', error);
      return {
        blob: audioBlob,
        duration: 0,
        size: audioBlob.size,
        format: audioBlob.type,
      };
    }
  }

  private async compressWebM(blob: Blob): Promise<Blob> {
    // Simple re-packaging with metadata optimization
    // In production, you'd use a WebAssembly encoder like opus-encoder
    
    // For now, return the original blob
    // TODO: Implement actual WebM re-encoding with opus codec
    return blob;
  }

  private async convertAndCompress(blob: Blob): Promise<ProcessedAudio> {
    if (!this.audioContext) {
      await this.initialize();
    }

    try {
      // Read audio data
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);

      // Downsample and convert to mono if needed
      const processed = this.downsampleBuffer(audioBuffer);

      // Convert to Blob
      const wav = this.audioBufferToWav(processed);
      const wavBlob = new Blob([wav], { type: 'audio/wav' });

      return {
        blob: wavBlob,
        duration: audioBuffer.duration,
        size: wavBlob.size,
        format: 'wav',
        compressionRatio: blob.size / wavBlob.size,
      };
    } catch (error) {
      console.error('[AudioProcessor] Conversion failed:', error);
      throw error;
    }
  }

  /**
   * Downsample audio buffer to reduce size
   */
  private downsampleBuffer(buffer: AudioBuffer): AudioBuffer {
    const targetSampleRate = this.config.sampleRate;
    
    if (buffer.sampleRate === targetSampleRate && buffer.numberOfChannels === 1) {
      return buffer;
    }

    const ctx = this.audioContext!;
    const ratio = buffer.sampleRate / targetSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    
    // Create new buffer with target sample rate and mono channel
    const newBuffer = ctx.createBuffer(1, newLength, targetSampleRate);
    const newData = newBuffer.getChannelData(0);

    // Mix to mono if stereo
    const sourceData = buffer.numberOfChannels === 2
      ? this.mixToMono(buffer)
      : buffer.getChannelData(0);

    // Downsample using linear interpolation
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, buffer.length - 1);
      const t = srcIndex - srcIndexFloor;

      newData[i] = sourceData[srcIndexFloor] * (1 - t) + sourceData[srcIndexCeil] * t;
    }

    return newBuffer;
  }

  private mixToMono(buffer: AudioBuffer): Float32Array {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const mono = new Float32Array(left.length);

    for (let i = 0; i < left.length; i++) {
      mono[i] = (left[i] + right[i]) / 2;
    }

    return mono;
  }

  /**
   * Convert AudioBuffer to WAV format
   */
  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const length = buffer.length * buffer.numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);

    // WAV header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Format chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, buffer.numberOfChannels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * buffer.numberOfChannels * 2, true);
    view.setUint16(32, buffer.numberOfChannels * 2, true);
    view.setUint16(34, 16, true); // 16-bit samples
    this.writeString(view, 36, 'data');
    view.setUint32(40, length, true);

    // Audio data
    const offset = 44;
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return arrayBuffer;
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Estimate audio quality based on speech characteristics
   */
  analyzeAudioQuality(audioBlob: Blob): Promise<{
    quality: 'low' | 'medium' | 'high';
    snr: number; // Signal-to-noise ratio estimate
    clarity: number; // 0-1 score
  }> {
    // Simplified quality analysis
    // In production, use proper SNR and clarity detection
    return Promise.resolve({
      quality: 'medium',
      snr: 20, // dB estimate
      clarity: 0.8,
    });
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  getConfig(): AudioProcessorConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AudioProcessorConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
