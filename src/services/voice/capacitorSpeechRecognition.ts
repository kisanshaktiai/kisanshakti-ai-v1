/**
 * Capacitor Speech Recognition Integration
 * Provides native speech recognition for iOS and Android apps
 */

import { Capacitor } from '@capacitor/core';

// Dynamic import for Capacitor Speech Recognition to avoid build errors when not installed
let SpeechRecognitionPlugin: any = null;

/**
 * Initialize Capacitor Speech Recognition
 */
export async function initCapacitorSpeechRecognition(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    console.log('[CapacitorSpeech] Not a native platform, skipping');
    return false;
  }

  try {
    // Dynamic import to avoid bundling issues
    const module = await import('@capacitor-community/speech-recognition');
    SpeechRecognitionPlugin = module.SpeechRecognition;
    
    console.log('[CapacitorSpeech] Plugin loaded successfully');
    return true;
  } catch (error) {
    console.warn('[CapacitorSpeech] Plugin not available:', error);
    return false;
  }
}

/**
 * Check if Capacitor Speech Recognition is available
 */
export async function isCapacitorSpeechAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  if (!SpeechRecognitionPlugin) {
    await initCapacitorSpeechRecognition();
  }

  if (!SpeechRecognitionPlugin) {
    return false;
  }

  try {
    const { available } = await SpeechRecognitionPlugin.available();
    console.log('[CapacitorSpeech] Available:', available);
    return available;
  } catch (error) {
    console.error('[CapacitorSpeech] Error checking availability:', error);
    return false;
  }
}

/**
 * Request speech recognition permission
 */
export async function requestSpeechPermission(): Promise<boolean> {
  if (!SpeechRecognitionPlugin) {
    await initCapacitorSpeechRecognition();
  }

  if (!SpeechRecognitionPlugin) {
    return false;
  }

  try {
    const { granted } = await SpeechRecognitionPlugin.requestPermissions();
    console.log('[CapacitorSpeech] Permission granted:', granted);
    return granted;
  } catch (error) {
    console.error('[CapacitorSpeech] Permission error:', error);
    return false;
  }
}

export interface CapacitorSpeechResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

/**
 * Start listening with Capacitor Speech Recognition
 */
export async function startCapacitorListening(
  language: string,
  onResult: (result: CapacitorSpeechResult) => void,
  onEnd: () => void
): Promise<boolean> {
  if (!SpeechRecognitionPlugin) {
    await initCapacitorSpeechRecognition();
  }

  if (!SpeechRecognitionPlugin) {
    console.error('[CapacitorSpeech] Plugin not available');
    onEnd();
    return false;
  }

  try {
    // Map language codes
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
    };
    const recognitionLang = langMap[language] || 'en-US';

    // Add listener for partial results
    SpeechRecognitionPlugin.addListener('partialResults', (data: any) => {
      if (data.matches && data.matches.length > 0) {
        onResult({
          transcript: data.matches[0],
          isFinal: false,
          confidence: 0.8
        });
      }
    });

    // Start recognition
    await SpeechRecognitionPlugin.start({
      language: recognitionLang,
      maxResults: 1,
      popup: false,
      partialResults: true
    });

    console.log('[CapacitorSpeech] Started listening in', recognitionLang);
    return true;
  } catch (error) {
    console.error('[CapacitorSpeech] Start error:', error);
    onEnd();
    return false;
  }
}

/**
 * Stop Capacitor Speech Recognition
 */
export async function stopCapacitorListening(): Promise<string | null> {
  if (!SpeechRecognitionPlugin) {
    return null;
  }

  try {
    const result = await SpeechRecognitionPlugin.stop();
    
    // Remove listeners
    await SpeechRecognitionPlugin.removeAllListeners();
    
    if (result.matches && result.matches.length > 0) {
      console.log('[CapacitorSpeech] Final result:', result.matches[0]);
      return result.matches[0];
    }
    return null;
  } catch (error) {
    console.error('[CapacitorSpeech] Stop error:', error);
    return null;
  }
}

/**
 * Check if we should use Capacitor Speech Recognition
 */
export function shouldUseCapacitorSpeech(): boolean {
  return Capacitor.isNativePlatform();
}
