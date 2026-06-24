import { useEffect, useState } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { nativeTTSService } from '@/services/nativeTTSService';
import { voiceDownloadService } from '@/services/voiceDownloadService';

/**
 * Hook to initialize and manage native TTS voices based on app language
 * Works with Capacitor native TTS for Android/iOS APK
 */
export function useVoiceInitialization() {
  const { currentLanguage } = useLanguageStore();
  const [needsDownload, setNeedsDownload] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [deviceLanguages, setDeviceLanguages] = useState<string[]>([]);
  const [isFallbackNeeded, setIsFallbackNeeded] = useState(false);

  useEffect(() => {
    const initializeVoices = async () => {
      console.log('🎤 [Voice Init] Starting native TTS initialization...');

      try {
        // Wait for native TTS to initialize
        await nativeTTSService.ensureInitialized();
        
        // Get device supported languages
        const languages = nativeTTSService.getDeviceLanguages();
        setDeviceLanguages(languages);
        console.log('🎤 [Voice Init] Device languages:', languages.length);

        // Check if current language is available
        const isAvailable = nativeTTSService.isLanguageAvailableOnDevice(currentLanguage);
        
        if (!isAvailable) {
          // Check if fallback will be used
          const langInfo = nativeTTSService.getLanguageCode(currentLanguage);
          setIsFallbackNeeded(langInfo.isFallback);
          
          if (langInfo.isFallback) {
            console.log(`⚠️ [Voice Init] ${currentLanguage} will use fallback: ${langInfo.code}`);
          } else {
            console.log(`📥 [Voice Init] ${currentLanguage} voice needs device TTS installation`);
            setNeedsDownload(true);
          }
        } else {
          console.log(`✅ [Voice Init] ${currentLanguage} voice available`);
          setNeedsDownload(false);
          setIsFallbackNeeded(false);
        }

        setIsInitialized(true);
        console.log('✅ [Voice Init] Native TTS initialization complete');
      } catch (error) {
        console.error('❌ [Voice Init] Failed to initialize:', error);
        setIsInitialized(true); // Still mark as initialized to allow app to continue
      }
    };

    initializeVoices();

    // Retry voice checks on network restore
    const handleOnline = () => {
      console.log('📶 [Voice Init] Network available, rechecking voices...');
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
    currentLanguage,
    deviceLanguages,
    isFallbackNeeded,
    // Helper to get install instructions
    getInstallInstructions: () => voiceDownloadService.getInstallInstructions(currentLanguage),
    // Check if a specific language is available
    isLanguageAvailable: (lang: string) => nativeTTSService.isLanguageAvailableOnDevice(lang),
  };
}
