import { useEffect, useState } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useTTSStore, PREINSTALLED_VOICES } from '@/stores/ttsStore';
import { voiceDownloadService } from '@/services/voiceDownloadService';

/**
 * Hook to initialize and manage voice downloads based on app language
 */
export function useVoiceInitialization() {
  const { currentLanguage } = useLanguageStore();
  const [needsDownload, setNeedsDownload] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializeVoices = async () => {
      console.log('🎤 [Voice Init] Starting voice initialization...');

      // Wait for voices to load
      const waitForVoices = () => {
        return new Promise<void>((resolve) => {
          const voices = window.speechSynthesis?.getVoices() || [];
          if (voices.length > 0) {
            resolve();
          } else {
            window.speechSynthesis.onvoiceschanged = () => {
              resolve();
            };
          }
        });
      };

      await waitForVoices();

      // Update voice availability using getState to avoid dependency issues
      const voices = window.speechSynthesis.getVoices();
      useTTSStore.getState().updateVoiceAvailability(voices);

      // Verify pre-installed voices
      const missingVoices = await voiceDownloadService.verifyPreInstalledVoices();
      if (missingVoices.length > 0) {
        console.error('❌ [Voice Init] Critical voices missing:', missingVoices);
        // In production, this would trigger emergency download
      }

      // Check if current language needs download
      const langCode = `${currentLanguage}-IN`;
      const isPreInstalled = voiceDownloadService.isPreInstalledVoice(langCode);
      
      if (!isPreInstalled) {
        const voices = window.speechSynthesis.getVoices();
        const voiceExists = voices.some(v => 
          v.lang === langCode || v.lang.startsWith(currentLanguage)
        );

        if (!voiceExists) {
          console.log(`📥 [Voice Init] ${currentLanguage} voice needs download`);
          setNeedsDownload(true);
        }
      }

      setIsInitialized(true);
      console.log('✅ [Voice Init] Voice initialization complete');
    };

    initializeVoices();

    // Retry failed downloads on WiFi
    const handleOnline = () => {
      console.log('📶 [Voice Init] Network available, retrying failed downloads...');
      voiceDownloadService.retryFailedDownloads();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [currentLanguage]);

  return {
    needsDownload,
    isInitialized,
    currentLanguage
  };
}
