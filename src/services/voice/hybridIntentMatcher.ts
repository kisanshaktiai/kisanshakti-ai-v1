/**
 * Hybrid Intent Matcher
 * Offline-first local pattern matching + cloud AI fallback
 * Achieves <100ms response for 90% of commands
 */

import { supabase } from '@/integrations/supabase/client';

export interface MatchedIntent {
  intentId: string;
  action: string;
  route?: string;
  params?: Record<string, any>;
  confidence: number;
  provider: 'local' | 'cloud';
  latencyMs: number;
  announcement?: string;
}

export interface IntentPattern {
  id: string;
  patterns: string[];
  action: string;
  route?: string;
  params?: Record<string, any>;
  offline: boolean;
  priority: 'high' | 'medium' | 'low';
}

// Fast local intent patterns for all supported languages
const LOCAL_INTENTS: Record<string, IntentPattern[]> = {
  en: [
    { id: 'home', patterns: ['home', 'go home', 'main', 'main page'], action: 'navigate', route: '/app', offline: true, priority: 'high' },
    { id: 'lands', patterns: ['land', 'lands', 'my lands', 'farms', 'fields', 'show lands'], action: 'navigate', route: '/lands', offline: true, priority: 'high' },
    { id: 'weather', patterns: ['weather', 'forecast', 'rain', 'temperature'], action: 'navigate', route: '/weather', offline: true, priority: 'high' },
    { id: 'schedule', patterns: ['schedule', 'tasks', 'calendar', 'today tasks', 'my tasks'], action: 'navigate', route: '/schedule', offline: true, priority: 'high' },
    { id: 'chat', patterns: ['chat', 'assistant', 'help', 'ai', 'ask'], action: 'navigate', route: '/chat', offline: true, priority: 'high' },
    { id: 'market', patterns: ['market', 'shop', 'buy', 'sell', 'prices'], action: 'navigate', route: '/market', offline: true, priority: 'high' },
    { id: 'profile', patterns: ['profile', 'account', 'settings', 'my profile'], action: 'navigate', route: '/profile', offline: true, priority: 'high' },
    { id: 'community', patterns: ['community', 'social', 'farmers', 'connect'], action: 'navigate', route: '/social', offline: true, priority: 'medium' },
    { id: 'analytics', patterns: ['analytics', 'stats', 'statistics', 'reports'], action: 'navigate', route: '/analytics', offline: true, priority: 'medium' },
    { id: 'add_land', patterns: ['add land', 'new land', 'create land', 'register land'], action: 'navigate', route: '/add-land', offline: true, priority: 'high' },
    { id: 'scan', patterns: ['scan', 'scan crop', 'disease', 'identify'], action: 'navigate', route: '/chat', offline: true, priority: 'high' },
    { id: 'back', patterns: ['back', 'go back', 'previous', 'return'], action: 'back', offline: true, priority: 'high' },
  ],
  hi: [
    { id: 'home', patterns: ['होम', 'घर', 'मुख्य', 'मुख्य पेज'], action: 'navigate', route: '/app', offline: true, priority: 'high' },
    { id: 'lands', patterns: ['जमीन', 'खेत', 'भूमि', 'मेरी जमीन', 'खेत दिखाओ'], action: 'navigate', route: '/lands', offline: true, priority: 'high' },
    { id: 'weather', patterns: ['मौसम', 'बारिश', 'तापमान', 'मौसम कैसा'], action: 'navigate', route: '/weather', offline: true, priority: 'high' },
    { id: 'schedule', patterns: ['कार्यक्रम', 'काम', 'शेड्यूल', 'आज के काम', 'मेरे काम'], action: 'navigate', route: '/schedule', offline: true, priority: 'high' },
    { id: 'chat', patterns: ['चैट', 'सहायक', 'मदद', 'सवाल', 'पूछो'], action: 'navigate', route: '/chat', offline: true, priority: 'high' },
    { id: 'market', patterns: ['बाजार', 'खरीदो', 'बेचो', 'भाव', 'मार्केट'], action: 'navigate', route: '/market', offline: true, priority: 'high' },
    { id: 'profile', patterns: ['प्रोफाइल', 'खाता', 'सेटिंग', 'मेरा प्रोफाइल'], action: 'navigate', route: '/profile', offline: true, priority: 'high' },
    { id: 'community', patterns: ['समुदाय', 'किसान', 'सोशल', 'जुड़ो'], action: 'navigate', route: '/social', offline: true, priority: 'medium' },
    { id: 'analytics', patterns: ['विश्लेषण', 'आंकड़े', 'रिपोर्ट'], action: 'navigate', route: '/analytics', offline: true, priority: 'medium' },
    { id: 'add_land', patterns: ['जमीन जोड़ो', 'नई जमीन', 'खेत जोड़ो', 'नया खेत'], action: 'navigate', route: '/add-land', offline: true, priority: 'high' },
    { id: 'scan', patterns: ['स्कैन', 'जांच', 'बीमारी', 'पहचानो'], action: 'navigate', route: '/chat', offline: true, priority: 'high' },
    { id: 'back', patterns: ['वापस', 'पीछे', 'पिछला'], action: 'back', offline: true, priority: 'high' },
  ],
  mr: [
    { id: 'home', patterns: ['होम', 'घर', 'मुख्य', 'मुख्य पृष्ठ'], action: 'navigate', route: '/app', offline: true, priority: 'high' },
    { id: 'lands', patterns: ['जमीन', 'शेत', 'माझी जमीन', 'शेत दाखवा'], action: 'navigate', route: '/lands', offline: true, priority: 'high' },
    { id: 'weather', patterns: ['हवामान', 'पाऊस', 'तापमान'], action: 'navigate', route: '/weather', offline: true, priority: 'high' },
    { id: 'schedule', patterns: ['वेळापत्रक', 'काम', 'आजची कामे', 'माझी कामे'], action: 'navigate', route: '/schedule', offline: true, priority: 'high' },
    { id: 'chat', patterns: ['चॅट', 'सहाय्यक', 'मदत', 'प्रश्न', 'विचारा'], action: 'navigate', route: '/chat', offline: true, priority: 'high' },
    { id: 'market', patterns: ['बाजार', 'खरेदी', 'विक्री', 'भाव', 'मार्केट'], action: 'navigate', route: '/market', offline: true, priority: 'high' },
    { id: 'profile', patterns: ['प्रोफाइल', 'खाते', 'सेटिंग', 'माझे प्रोफाइल'], action: 'navigate', route: '/profile', offline: true, priority: 'high' },
    { id: 'back', patterns: ['मागे', 'परत', 'मागील'], action: 'back', offline: true, priority: 'high' },
  ],
  pa: [
    { id: 'home', patterns: ['ਹੋਮ', 'ਘਰ', 'ਮੁੱਖ', 'ਮੁੱਖ ਪੰਨਾ'], action: 'navigate', route: '/app', offline: true, priority: 'high' },
    { id: 'lands', patterns: ['ਜ਼ਮੀਨ', 'ਖੇਤ', 'ਮੇਰੀ ਜ਼ਮੀਨ', 'ਖੇਤ ਦਿਖਾਓ'], action: 'navigate', route: '/lands', offline: true, priority: 'high' },
    { id: 'weather', patterns: ['ਮੌਸਮ', 'ਬਾਰਿਸ਼', 'ਤਾਪਮਾਨ'], action: 'navigate', route: '/weather', offline: true, priority: 'high' },
    { id: 'schedule', patterns: ['ਸ਼ੈਡਿਊਲ', 'ਕੰਮ', 'ਅੱਜ ਦੇ ਕੰਮ', 'ਮੇਰੇ ਕੰਮ'], action: 'navigate', route: '/schedule', offline: true, priority: 'high' },
    { id: 'chat', patterns: ['ਚੈਟ', 'ਸਹਾਇਕ', 'ਮਦਦ', 'ਸਵਾਲ'], action: 'navigate', route: '/chat', offline: true, priority: 'high' },
    { id: 'market', patterns: ['ਬਾਜ਼ਾਰ', 'ਖਰੀਦੋ', 'ਵੇਚੋ', 'ਭਾਅ'], action: 'navigate', route: '/market', offline: true, priority: 'high' },
    { id: 'profile', patterns: ['ਪ੍ਰੋਫਾਈਲ', 'ਖਾਤਾ', 'ਸੈਟਿੰਗ'], action: 'navigate', route: '/profile', offline: true, priority: 'high' },
    { id: 'back', patterns: ['ਪਿੱਛੇ', 'ਵਾਪਸ'], action: 'back', offline: true, priority: 'high' },
  ],
  ta: [
    { id: 'home', patterns: ['ஹோம்', 'வீடு', 'முதன்மை', 'முதல் பக்கம்'], action: 'navigate', route: '/app', offline: true, priority: 'high' },
    { id: 'lands', patterns: ['நிலம்', 'வயல்', 'என் நிலம்', 'நிலம் காட்டு'], action: 'navigate', route: '/lands', offline: true, priority: 'high' },
    { id: 'weather', patterns: ['வானிலை', 'மழை', 'வெப்பநிலை'], action: 'navigate', route: '/weather', offline: true, priority: 'high' },
    { id: 'schedule', patterns: ['அட்டவணை', 'பணிகள்', 'இன்றைய பணிகள்', 'என் பணிகள்'], action: 'navigate', route: '/schedule', offline: true, priority: 'high' },
    { id: 'chat', patterns: ['சாட்', 'உதவியாளர்', 'உதவி', 'கேள்வி'], action: 'navigate', route: '/chat', offline: true, priority: 'high' },
    { id: 'market', patterns: ['சந்தை', 'வாங்கு', 'விற்கவும்', 'விலை'], action: 'navigate', route: '/market', offline: true, priority: 'high' },
    { id: 'profile', patterns: ['சுயவிவரம்', 'கணக்கு', 'அமைப்புகள்'], action: 'navigate', route: '/profile', offline: true, priority: 'high' },
    { id: 'back', patterns: ['பின்னால்', 'திரும்பு'], action: 'back', offline: true, priority: 'high' },
  ],
};

// Announcements per language
const ANNOUNCEMENTS: Record<string, Record<string, string>> = {
  en: {
    home: 'Opening home',
    lands: 'Opening your lands',
    weather: 'Opening weather',
    schedule: 'Opening schedule',
    chat: 'Opening chat',
    market: 'Opening market',
    profile: 'Opening profile',
    community: 'Opening community',
    analytics: 'Opening analytics',
    add_land: 'Add new land',
    scan: 'Opening scanner',
    back: 'Going back',
  },
  hi: {
    home: 'होम खोल रहे हैं',
    lands: 'आपकी जमीन खोल रहे हैं',
    weather: 'मौसम खोल रहे हैं',
    schedule: 'कार्यक्रम खोल रहे हैं',
    chat: 'चैट खोल रहे हैं',
    market: 'बाजार खोल रहे हैं',
    profile: 'प्रोफाइल खोल रहे हैं',
    community: 'समुदाय खोल रहे हैं',
    analytics: 'विश्लेषण खोल रहे हैं',
    add_land: 'नई जमीन जोड़ें',
    scan: 'स्कैनर खोल रहे हैं',
    back: 'वापस जा रहे हैं',
  },
  mr: {
    home: 'होम उघडत आहे',
    lands: 'तुमची जमीन उघडत आहे',
    weather: 'हवामान उघडत आहे',
    schedule: 'वेळापत्रक उघडत आहे',
    chat: 'चॅट उघडत आहे',
    market: 'बाजार उघडत आहे',
    profile: 'प्रोफाइल उघडत आहे',
    back: 'मागे जात आहे',
  },
  pa: {
    home: 'ਹੋਮ ਖੋਲ ਰਿਹਾ ਹੈ',
    lands: 'ਤੁਹਾਡੀ ਜ਼ਮੀਨ ਖੋਲ ਰਿਹਾ ਹੈ',
    weather: 'ਮੌਸਮ ਖੋਲ ਰਿਹਾ ਹੈ',
    schedule: 'ਸ਼ੈਡਿਊਲ ਖੋਲ ਰਿਹਾ ਹੈ',
    chat: 'ਚੈਟ ਖੋਲ ਰਿਹਾ ਹੈ',
    market: 'ਬਾਜ਼ਾਰ ਖੋਲ ਰਿਹਾ ਹੈ',
    profile: 'ਪ੍ਰੋਫਾਈਲ ਖੋਲ ਰਿਹਾ ਹੈ',
    back: 'ਪਿੱਛੇ ਜਾ ਰਿਹਾ ਹੈ',
  },
  ta: {
    home: 'ஹோம் திறக்கிறது',
    lands: 'உங்கள் நிலம் திறக்கிறது',
    weather: 'வானிலை திறக்கிறது',
    schedule: 'அட்டவணை திறக்கிறது',
    chat: 'சாட் திறக்கிறது',
    market: 'சந்தை திறக்கிறது',
    profile: 'சுயவிவரம் திறக்கிறது',
    back: 'பின்னால் செல்கிறது',
  },
};

class HybridIntentMatcher {
  private language = 'en';
  private isOnline = navigator.onLine;

  constructor() {
    // Listen for online/offline changes
    window.addEventListener('online', () => { this.isOnline = true; });
    window.addEventListener('offline', () => { this.isOnline = false; });
  }

  setLanguage(lang: string): void {
    this.language = lang.split('-')[0]; // Extract base language
  }

  /**
   * Match intent - tries local first, then cloud fallback
   */
  async matchIntent(transcript: string): Promise<MatchedIntent | null> {
    const startTime = performance.now();
    const normalizedTranscript = this.normalizeText(transcript);

    // Try local matching first (instant)
    const localMatch = this.matchLocal(normalizedTranscript);
    if (localMatch) {
      localMatch.latencyMs = performance.now() - startTime;
      console.log('[IntentMatcher] Local match:', localMatch.intentId, 'in', localMatch.latencyMs.toFixed(0), 'ms');
      return localMatch;
    }

    // If offline, return null - can't use cloud
    if (!this.isOnline) {
      console.log('[IntentMatcher] Offline, no match found');
      return null;
    }

    // Try cloud fallback for complex queries
    try {
      const cloudMatch = await this.matchCloud(transcript);
      if (cloudMatch) {
        cloudMatch.latencyMs = performance.now() - startTime;
        console.log('[IntentMatcher] Cloud match:', cloudMatch.intentId, 'in', cloudMatch.latencyMs.toFixed(0), 'ms');
        return cloudMatch;
      }
    } catch (error) {
      console.error('[IntentMatcher] Cloud fallback error:', error);
    }

    return null;
  }

  /**
   * Fast local pattern matching using fuzzy search
   */
  private matchLocal(transcript: string): MatchedIntent | null {
    const intents = LOCAL_INTENTS[this.language] || LOCAL_INTENTS['en'];
    const announcements = ANNOUNCEMENTS[this.language] || ANNOUNCEMENTS['en'];

    let bestMatch: { intent: IntentPattern; score: number } | null = null;

    for (const intent of intents) {
      for (const pattern of intent.patterns) {
        const score = this.calculateMatchScore(transcript, pattern);
        
        if (score > 0.6 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { intent, score };
        }
      }
    }

    if (!bestMatch) return null;

    return {
      intentId: bestMatch.intent.id,
      action: bestMatch.intent.action,
      route: bestMatch.intent.route,
      params: bestMatch.intent.params,
      confidence: bestMatch.score,
      provider: 'local',
      latencyMs: 0,
      announcement: announcements[bestMatch.intent.id],
    };
  }

  /**
   * Cloud AI fallback for complex queries
   */
  private async matchCloud(transcript: string): Promise<MatchedIntent | null> {
    try {
      const { data, error } = await supabase.functions.invoke('voice-navigation-agent', {
        body: {
          transcript,
          language: this.language,
          context: {
            currentRoute: window.location.pathname,
          },
        },
      });

      if (error) throw error;

      if (data?.matched && data.intent) {
        return {
          intentId: data.intent,
          action: data.action || 'navigate',
          route: data.route,
          params: data.params,
          confidence: data.confidence || 0.75,
          provider: 'cloud',
          latencyMs: 0,
          announcement: data.response,
        };
      }

      return null;
    } catch (error) {
      console.error('[IntentMatcher] Cloud API error:', error);
      return null;
    }
  }

  /**
   * Calculate match score between transcript and pattern
   * Uses combination of exact match, contains, and fuzzy matching
   */
  private calculateMatchScore(transcript: string, pattern: string): number {
    const normalizedPattern = this.normalizeText(pattern);

    // Exact match
    if (transcript === normalizedPattern) return 1.0;

    // Contains pattern
    if (transcript.includes(normalizedPattern)) return 0.9;
    if (normalizedPattern.includes(transcript)) return 0.85;

    // Word boundary match
    const words = transcript.split(/\s+/);
    const patternWords = normalizedPattern.split(/\s+/);
    
    let matchedWords = 0;
    for (const pWord of patternWords) {
      if (words.some(w => w === pWord || this.levenshteinSimilarity(w, pWord) > 0.8)) {
        matchedWords++;
      }
    }
    
    if (matchedWords === patternWords.length) return 0.85;
    if (matchedWords > 0) return 0.6 + (matchedWords / patternWords.length) * 0.2;

    // Fuzzy match
    return this.levenshteinSimilarity(transcript, normalizedPattern);
  }

  private normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/[।,?!.]/g, '');
  }

  private levenshteinSimilarity(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[b.length][a.length];
    const maxLength = Math.max(a.length, b.length);
    return 1 - distance / maxLength;
  }

  /**
   * Get example commands for current language
   */
  getExamples(): string[] {
    const intents = LOCAL_INTENTS[this.language] || LOCAL_INTENTS['en'];
    return intents.slice(0, 6).map(i => i.patterns[0]);
  }

  /**
   * Get all available intents
   */
  getAvailableIntents(): IntentPattern[] {
    return LOCAL_INTENTS[this.language] || LOCAL_INTENTS['en'];
  }
}

export const hybridIntentMatcher = new HybridIntentMatcher();
export default hybridIntentMatcher;
