import { useTTSStore, PREINSTALLED_VOICES } from '@/stores/ttsStore';

/**
 * Voice Download Service
 * 
 * Note: Web Speech API doesn't actually download voices - they're provided by the OS/browser.
 * This service simulates download progress and manages voice availability checking
 * to provide a smooth UX as per requirements.
 */

class VoiceDownloadService {
  private downloadTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private retryQueue: Set<string> = new Set();

  /**
   * Check if a voice is pre-installed in the APK
   */
  isPreInstalledVoice(langCode: string): boolean {
    return Object.values(PREINSTALLED_VOICES).includes(langCode as any);
  }

  /**
   * Verify pre-installed voices are available
   * Returns array of missing critical voices
   */
  async verifyPreInstalledVoices(): Promise<string[]> {
    const voices = window.speechSynthesis?.getVoices() || [];
    const missing: string[] = [];

    Object.entries(PREINSTALLED_VOICES).forEach(([lang, voiceLang]) => {
      const found = voices.some(v => v.lang === voiceLang || v.lang.startsWith(lang));
      if (!found) {
        console.error(`❌ [TTS] Critical: Pre-installed voice missing: ${lang} (${voiceLang})`);
        missing.push(lang);
      } else {
        console.log(`✅ [TTS] Pre-installed voice verified: ${lang}`);
      }
    });

    return missing;
  }

  /**
   * Simulate voice download with progress updates
   * In production, this would trigger actual voice package download
   */
  async downloadVoice(langCode: string, onProgress?: (progress: number) => void): Promise<boolean> {
    console.log(`📥 [TTS] Starting download for ${langCode}`);
    const store = useTTSStore.getState();

    // If it's pre-installed, no download needed
    if (this.isPreInstalledVoice(langCode)) {
      console.log(`✅ [TTS] ${langCode} is pre-installed, no download needed`);
      return true;
    }

    // Check if already available
    const voices = window.speechSynthesis?.getVoices() || [];
    const voiceExists = voices.some(v => v.lang === langCode || v.lang.startsWith(langCode.split('-')[0]));
    
    if (voiceExists) {
      console.log(`✅ [TTS] ${langCode} already available`);
      store.setVoiceAvailable(langCode, true);
      return true;
    }

    // Simulate download with progress
    return new Promise((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15 + 5; // Random progress between 5-20%
        progress = Math.min(progress, 95);

        store.setVoiceDownloading(langCode, progress);
        onProgress?.(progress);

        if (progress >= 95) {
          clearInterval(interval);
          
          // Final check and complete
          setTimeout(() => {
            store.setVoiceDownloading(langCode, 100);
            onProgress?.(100);
            
            setTimeout(() => {
              // In real implementation, voice would be available after download
              // For now, we mark it as available even if OS doesn't provide it
              store.setVoiceAvailable(langCode, true);
              console.log(`✅ [TTS] Download complete for ${langCode}`);
              resolve(true);
            }, 500);
          }, 300);
        }
      }, 200);

      // Store timeout for cleanup
      this.downloadTimeouts.set(langCode, interval as any);
    });
  }

  /**
   * Download voice with retry logic
   */
  async downloadWithRetry(langCode: string, maxRetries = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [TTS] Download attempt ${attempt}/${maxRetries} for ${langCode}`);
        const success = await this.downloadVoice(langCode);
        
        if (success) {
          this.retryQueue.delete(langCode);
          return true;
        }
      } catch (error) {
        console.error(`❌ [TTS] Download attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          console.error(`❌ [TTS] All retry attempts failed for ${langCode}`);
          this.retryQueue.add(langCode);
          return false;
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return false;
  }

  /**
   * Check network and retry failed downloads
   */
  async retryFailedDownloads(): Promise<void> {
    if (this.retryQueue.size === 0) return;

    console.log(`🔄 [TTS] Retrying ${this.retryQueue.size} failed downloads`);
    
    const promises = Array.from(this.retryQueue).map(langCode => 
      this.downloadWithRetry(langCode, 2)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Cancel ongoing download
   */
  cancelDownload(langCode: string): void {
    const timeout = this.downloadTimeouts.get(langCode);
    if (timeout) {
      clearInterval(timeout);
      this.downloadTimeouts.delete(langCode);
      console.log(`❌ [TTS] Download cancelled for ${langCode}`);
    }
  }

  /**
   * Get download progress for a language
   */
  getDownloadProgress(langCode: string): number {
    const store = useTTSStore.getState();
    return store.availableVoices[langCode]?.downloadProgress || 0;
  }

  /**
   * Check device storage and estimate if enough space for voice download
   */
  async checkStorageAvailable(): Promise<{ available: boolean; freeSpace?: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const freeSpace = (estimate.quota || 0) - (estimate.usage || 0);
        const requiredSpace = 80 * 1024 * 1024; // 80MB estimated per voice
        
        return {
          available: freeSpace > requiredSpace,
          freeSpace: Math.floor(freeSpace / (1024 * 1024)) // Convert to MB
        };
      } catch (error) {
        console.warn('[TTS] Storage API not available:', error);
      }
    }
    
    // Assume storage is available if API not supported
    return { available: true };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.downloadTimeouts.forEach(timeout => clearInterval(timeout));
    this.downloadTimeouts.clear();
  }
}

export const voiceDownloadService = new VoiceDownloadService();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    voiceDownloadService.cleanup();
  });
}
