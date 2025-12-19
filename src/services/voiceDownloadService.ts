import { useTTSStore, PREINSTALLED_VOICES, ALL_INDIAN_LANGUAGES } from '@/stores/ttsStore';
import { nativeTTSService } from '@/services/nativeTTSService';

/**
 * Voice Download Service
 * 
 * For native TTS (Capacitor), voices are provided by the device OS.
 * This service manages voice availability checking and provides
 * guidance to users for installing language packs on their devices.
 */

class VoiceDownloadService {
  private downloadTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private retryQueue: Set<string> = new Set();

  /**
   * Check if a voice is pre-installed in the APK
   */
  isPreInstalledVoice(langCode: string): boolean {
    const baseLang = langCode.split('-')[0];
    return baseLang in PREINSTALLED_VOICES || 
           Object.values(PREINSTALLED_VOICES).includes(langCode as any);
  }

  /**
   * Verify pre-installed voices are available
   * For native TTS, checks device TTS support
   */
  async verifyPreInstalledVoices(): Promise<string[]> {
    const missing: string[] = [];
    
    // Check native TTS availability
    const deviceLanguages = nativeTTSService.getDeviceLanguages();
    
    Object.entries(PREINSTALLED_VOICES).forEach(([lang, voiceLang]) => {
      const found = deviceLanguages.some(dl => 
        dl.toLowerCase() === voiceLang.toLowerCase() || 
        dl.toLowerCase().startsWith(lang.toLowerCase())
      );
      
      if (!found) {
        console.warn(`⚠️ [TTS] Pre-installed voice may need device TTS: ${lang} (${voiceLang})`);
        missing.push(lang);
      } else {
        console.log(`✅ [TTS] Pre-installed voice verified: ${lang}`);
      }
    });

    return missing;
  }

  /**
   * Check if a language is available on the device
   */
  isLanguageAvailable(langCode: string): boolean {
    return nativeTTSService.isLanguageAvailableOnDevice(langCode);
  }

  /**
   * Get instructions for installing voice on device
   */
  getInstallInstructions(langCode: string): { title: string; steps: string[] } {
    const langInfo = nativeTTSService.getLanguageInfo(langCode);
    const langName = langInfo?.name || langCode;
    
    return {
      title: `Install ${langName} TTS Voice`,
      steps: [
        'Open your device Settings',
        'Go to "System" → "Languages & input"',
        'Tap "Text-to-speech output"',
        'Select your TTS engine (Google TTS recommended)',
        'Tap "Language" and select ' + langName,
        'Download the voice data if prompted',
        'Return to the app and try again'
      ]
    };
  }

  /**
   * Get all supported languages with their availability status
   */
  getSupportedLanguagesWithStatus(): Array<{
    code: string;
    name: string;
    nativeName: string;
    isAvailable: boolean;
    isPreInstalled: boolean;
  }> {
    const deviceLanguages = nativeTTSService.getDeviceLanguages();
    
    return nativeTTSService.getSupportedLanguages().map(lang => {
      const baseLang = lang.code.split('-')[0];
      const isAvailable = deviceLanguages.some(dl => 
        dl.toLowerCase() === lang.code.toLowerCase() ||
        dl.toLowerCase().startsWith(baseLang.toLowerCase())
      );
      
      return {
        code: lang.code,
        name: lang.name,
        nativeName: lang.nativeName,
        isAvailable,
        isPreInstalled: this.isPreInstalledVoice(lang.code)
      };
    });
  }

  /**
   * Simulate voice download (for UI progress indication)
   * In native TTS, voices are managed by the device OS
   */
  async downloadVoice(langCode: string, onProgress?: (progress: number) => void): Promise<boolean> {
    console.log(`📥 [TTS] Checking voice availability for ${langCode}`);
    const store = useTTSStore.getState();

    // Check if already available on device
    if (nativeTTSService.isLanguageAvailableOnDevice(langCode)) {
      console.log(`✅ [TTS] ${langCode} available on device`);
      store.setVoiceAvailable(langCode, true);
      onProgress?.(100);
      return true;
    }

    // For native TTS, we can't actually download voices
    // User needs to install from device settings
    console.warn(`⚠️ [TTS] ${langCode} not available. User needs to install from device settings.`);
    
    // Simulate progress for UX
    return new Promise((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        onProgress?.(Math.min(progress, 90));
        
        if (progress >= 90) {
          clearInterval(interval);
          // Check again after "download"
          const isNowAvailable = nativeTTSService.isLanguageAvailableOnDevice(langCode);
          store.setVoiceAvailable(langCode, isNowAvailable);
          onProgress?.(100);
          resolve(isNowAvailable);
        }
      }, 100);
      
      this.downloadTimeouts.set(langCode, interval as any);
    });
  }

  /**
   * Download voice with retry logic
   */
  async downloadWithRetry(langCode: string, maxRetries = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [TTS] Check attempt ${attempt}/${maxRetries} for ${langCode}`);
        const success = await this.downloadVoice(langCode);
        
        if (success) {
          this.retryQueue.delete(langCode);
          return true;
        }
      } catch (error) {
        console.error(`❌ [TTS] Check attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          this.retryQueue.add(langCode);
          return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
    
    return false;
  }

  /**
   * Retry failed downloads
   */
  async retryFailedDownloads(): Promise<void> {
    if (this.retryQueue.size === 0) return;

    console.log(`🔄 [TTS] Retrying ${this.retryQueue.size} failed checks`);
    
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
    }
  }

  /**
   * Get download progress
   */
  getDownloadProgress(langCode: string): number {
    const store = useTTSStore.getState();
    return store.availableVoices[langCode]?.downloadProgress || 0;
  }

  /**
   * Check storage availability
   */
  async checkStorageAvailable(): Promise<{ available: boolean; freeSpace?: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const freeSpace = (estimate.quota || 0) - (estimate.usage || 0);
        return {
          available: freeSpace > 50 * 1024 * 1024, // 50MB
          freeSpace: Math.floor(freeSpace / (1024 * 1024))
        };
      } catch (error) {
        console.warn('[TTS] Storage API not available');
      }
    }
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
