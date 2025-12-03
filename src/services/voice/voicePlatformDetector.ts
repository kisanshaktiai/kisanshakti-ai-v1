import { Capacitor } from '@capacitor/core';
import { shouldUseCapacitorSpeech } from './capacitorSpeechRecognition';

/**
 * Voice Platform Detection Utility
 * Detects speech recognition support across different platforms
 */

export interface VoicePlatformInfo {
  platform: 'web' | 'android' | 'ios';
  isNative: boolean;
  hasBrowserSpeechAPI: boolean;
  hasNativeSpeechCapability: boolean;
  isSupported: boolean;
  unsupportedReason?: string;
  browserName: string;
  isWebView: boolean;
}

/**
 * Detect current browser/WebView
 */
function detectBrowser(): { name: string; isWebView: boolean } {
  const ua = navigator.userAgent.toLowerCase();
  
  // Detect in-app browsers/WebViews (these usually don't support Web Speech API)
  const isWebView = /fb_iab|fban|fbav|instagram|whatsapp|line|wechat|micromessenger|webview|wv\)|samsungbrowser/.test(ua);
  
  // Detect specific browsers
  let name = 'Unknown';
  
  if (/edg/.test(ua)) {
    name = 'Edge';
  } else if (/chrome/.test(ua) && !/edg/.test(ua)) {
    name = 'Chrome';
  } else if (/safari/.test(ua) && !/chrome/.test(ua)) {
    name = 'Safari';
  } else if (/firefox/.test(ua)) {
    name = 'Firefox';
  } else if (/opera|opr/.test(ua)) {
    name = 'Opera';
  } else if (/samsungbrowser/.test(ua)) {
    name = 'Samsung Internet';
  } else if (/ucbrowser/.test(ua)) {
    name = 'UC Browser';
  } else if (/miuibrowser/.test(ua)) {
    name = 'Mi Browser';
  }
  
  // Additional WebView checks
  const isAndroidWebView = /wv\)/.test(ua) || (/android/.test(ua) && /version\//.test(ua));
  const isFacebookBrowser = /fb_iab|fban|fbav/.test(ua);
  const isInstagram = /instagram/.test(ua);
  
  return {
    name,
    isWebView: isWebView || isAndroidWebView || isFacebookBrowser || isInstagram
  };
}

/**
 * Check if Web Speech API is available
 */
function hasBrowserSpeechAPI(): boolean {
  const SpeechRecognition = (window as any).SpeechRecognition || 
                           (window as any).webkitSpeechRecognition;
  return !!(SpeechRecognition && window.speechSynthesis);
}

/**
 * Get comprehensive platform info for voice support
 */
export function getVoicePlatformInfo(): VoicePlatformInfo {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform() as 'web' | 'android' | 'ios';
  const browserInfo = detectBrowser();
  const hasBrowserAPI = hasBrowserSpeechAPI();
  
  // Determine if native speech capability exists
  // For native apps, we assume capability exists (via Capacitor plugin)
  // For web, check browser API
  const hasNativeSpeechCapability = isNative; // Native platforms can use Capacitor Speech Recognition
  
  let isSupported = false;
  let unsupportedReason: string | undefined;
  
  if (isNative) {
    // Native Capacitor app - speech recognition available via plugin
    // Even if browser API isn't available, native plugin can provide it
    isSupported = true;
    console.log('[VoicePlatform] Native platform detected, speech supported via native APIs');
  } else if (hasBrowserAPI) {
    // Web browser with Speech API support
    isSupported = true;
    console.log('[VoicePlatform] Browser Speech API available');
  } else {
    // No speech support
    isSupported = false;
    
    // Determine specific reason
    if (browserInfo.isWebView) {
      unsupportedReason = 'in_app_browser';
    } else if (browserInfo.name === 'Firefox') {
      unsupportedReason = 'firefox_no_support';
    } else if (browserInfo.name === 'Samsung Internet') {
      unsupportedReason = 'samsung_browser';
    } else if (browserInfo.name === 'UC Browser' || browserInfo.name === 'Mi Browser') {
      unsupportedReason = 'unsupported_browser';
    } else {
      unsupportedReason = 'unknown';
    }
  }
  
  console.log('[VoicePlatform] Platform info:', {
    platform,
    isNative,
    hasBrowserAPI,
    hasNativeSpeechCapability,
    isSupported,
    browser: browserInfo.name,
    isWebView: browserInfo.isWebView,
    unsupportedReason
  });
  
  return {
    platform,
    isNative,
    hasBrowserSpeechAPI: hasBrowserAPI,
    hasNativeSpeechCapability,
    isSupported,
    unsupportedReason,
    browserName: browserInfo.name,
    isWebView: browserInfo.isWebView
  };
}

/**
 * Get user-friendly message for unsupported voice
 */
export function getUnsupportedMessage(language: string = 'en', reason?: string): { title: string; description: string } {
  const messages: Record<string, Record<string, { title: string; description: string }>> = {
    en: {
      in_app_browser: {
        title: 'Open in Browser',
        description: 'Voice commands work best in Chrome, Edge, or Safari. Tap the menu (⋮) and select "Open in Browser".'
      },
      firefox_no_support: {
        title: 'Browser Not Supported',
        description: 'Firefox doesn\'t support voice recognition. Please use Chrome, Edge, or Safari.'
      },
      samsung_browser: {
        title: 'Browser Not Supported',
        description: 'Samsung Internet has limited voice support. Please use Chrome for best experience.'
      },
      unsupported_browser: {
        title: 'Browser Not Supported',
        description: 'Your browser doesn\'t support voice recognition. Please use Chrome, Edge, or Safari.'
      },
      unknown: {
        title: 'Voice Not Available',
        description: 'Voice recognition is not available. Try opening the app in Chrome browser.'
      }
    },
    hi: {
      in_app_browser: {
        title: 'ब्राउज़र में खोलें',
        description: 'वॉइस कमांड Chrome, Edge या Safari में बेहतर काम करते हैं। मेनू (⋮) टैप करें और "ब्राउज़र में खोलें" चुनें।'
      },
      firefox_no_support: {
        title: 'ब्राउज़र समर्थित नहीं',
        description: 'Firefox वॉइस रिकग्निशन सपोर्ट नहीं करता। कृपया Chrome, Edge या Safari का उपयोग करें।'
      },
      samsung_browser: {
        title: 'ब्राउज़र समर्थित नहीं',
        description: 'Samsung Internet में सीमित वॉइस सपोर्ट है। बेहतर अनुभव के लिए Chrome का उपयोग करें।'
      },
      unsupported_browser: {
        title: 'ब्राउज़र समर्थित नहीं',
        description: 'आपका ब्राउज़र वॉइस रिकग्निशन सपोर्ट नहीं करता। Chrome, Edge या Safari का उपयोग करें।'
      },
      unknown: {
        title: 'वॉइस उपलब्ध नहीं',
        description: 'वॉइस रिकग्निशन उपलब्ध नहीं है। Chrome ब्राउज़र में ऐप खोलने का प्रयास करें।'
      }
    },
    mr: {
      in_app_browser: {
        title: 'ब्राउझरमध्ये उघडा',
        description: 'व्हॉइस कमांड्स Chrome, Edge किंवा Safari मध्ये उत्तम कार्य करतात। मेनू (⋮) टॅप करा आणि "ब्राउझरमध्ये उघडा" निवडा.'
      },
      firefox_no_support: {
        title: 'ब्राउझर समर्थित नाही',
        description: 'Firefox व्हॉइस रिकग्निशन समर्थित करत नाही. कृपया Chrome, Edge किंवा Safari वापरा.'
      },
      samsung_browser: {
        title: 'ब्राउझर समर्थित नाही',
        description: 'Samsung Internet मध्ये मर्यादित व्हॉइस समर्थन आहे. उत्तम अनुभवासाठी Chrome वापरा.'
      },
      unsupported_browser: {
        title: 'ब्राउझर समर्थित नाही',
        description: 'तुमचा ब्राउझर व्हॉइस रिकग्निशन समर्थित करत नाही. Chrome, Edge किंवा Safari वापरा.'
      },
      unknown: {
        title: 'व्हॉइस उपलब्ध नाही',
        description: 'व्हॉइस रिकग्निशन उपलब्ध नाही. Chrome ब्राउझरमध्ये अॅप उघडण्याचा प्रयत्न करा.'
      }
    }
  };
  
  const langMessages = messages[language] || messages['en'];
  const key = reason || 'unknown';
  return langMessages[key] || langMessages['unknown'];
}

/**
 * Check if we should show voice features at all
 * Returns true for native apps even without browser API (they use native plugins)
 */
export function shouldShowVoiceFeatures(): boolean {
  const info = getVoicePlatformInfo();
  return info.isSupported || info.isNative;
}
