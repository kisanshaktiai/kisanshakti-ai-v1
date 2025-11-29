import { supabase } from '@/integrations/supabase/client';
import { VoiceIntent, VoiceUtterance } from './types';
import { SlotExtractor } from './SlotExtractor';

export class DatabaseIntentMatcher {
  private intents: VoiceIntent[] = [];
  private currentLanguage: string = 'hi';
  private tenantId: string = '';
  private cachedIntents: Map<string, VoiceIntent[]> = new Map();
  private slotExtractor: SlotExtractor;

  constructor() {
    this.slotExtractor = new SlotExtractor('hi');
    this.loadFromCache();
  }

  async loadIntents(language: string, tenantId: string): Promise<void> {
    this.currentLanguage = language;
    this.tenantId = tenantId;
    this.slotExtractor.setLanguage(language);

    const cacheKey = `${tenantId}-${language}`;

    // Try cache first for offline support
    if (this.cachedIntents.has(cacheKey)) {
      this.intents = this.cachedIntents.get(cacheKey) || [];
      return;
    }

    try {
      // Use any type temporarily until types are regenerated
      const { data, error } = await supabase
        .from('voice_navigation_intents' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('language_code', language)
        .eq('is_active', true)
        .order('priority', { ascending: false }) as any;

      if (error) throw error;

      if (data && data.length > 0) {
        this.intents = data.map((row: any) => ({
          id: row.intent_id,
          patterns: Array.isArray(row.patterns) ? row.patterns : [],
          slots: [],
          priority: (row.priority || 'medium') as 'high' | 'medium' | 'low',
          offline: row.is_offline !== false,
          action: row.action || 'navigate',
          route: row.route || undefined,
          params: row.params || undefined,
        }));

        // Cache intents
        this.cachedIntents.set(cacheKey, this.intents);
        this.saveToCache();
      } else {
        // Fallback to local JSON if database is empty
        await this.loadFromJSON(language);
      }
    } catch (error) {
      console.error('Error loading intents from database:', error);
      // Fallback to local JSON
      await this.loadFromJSON(language);
    }
  }

  private async loadFromJSON(language: string): Promise<void> {
    try {
      const module = await import(`./intents/${language}.json`);
      const intents = module.default?.intents || [];
      // Ensure proper typing
      this.intents = intents.map((intent: any) => ({
        ...intent,
        priority: intent.priority || 'medium',
        offline: intent.offline !== false,
        slots: intent.slots || [],
      }));
    } catch (error) {
      console.warn(`No intent file found for language: ${language}, falling back to English`);
      try {
        const module = await import('./intents/en.json');
        const intents = module.default?.intents || [];
        this.intents = intents.map((intent: any) => ({
          ...intent,
          priority: intent.priority || 'medium',
          offline: intent.offline !== false,
          slots: intent.slots || [],
        }));
      } catch {
        this.intents = [];
      }
    }
  }

  matchIntent(transcript: string, isOffline: boolean = false): VoiceUtterance | null {
    const normalizedTranscript = transcript.toLowerCase().trim();
    
    let bestMatch: VoiceIntent | null = null;
    let highestConfidence = 0;

    for (const intent of this.intents) {
      if (isOffline && !intent.offline) continue;

      for (const pattern of intent.patterns) {
        const confidence = this.calculateSimilarity(
          normalizedTranscript,
          pattern.toLowerCase()
        );

        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestMatch = intent;
        }
      }
    }

    // Require at least 60% confidence
    if (bestMatch && highestConfidence >= 0.6) {
      // Extract slots if intent has slot definitions
      const extractedSlots = bestMatch.slots && bestMatch.slots.length > 0
        ? this.slotExtractor.extractSlots(transcript, bestMatch.slots)
        : this.slotExtractor.extractAll(transcript); // Fallback to extract all common slots

      return {
        text: transcript,
        intent: bestMatch.id,
        confidence: highestConfidence,
        slots: extractedSlots,
        language: this.currentLanguage,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Check for exact substring match first
    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.95;
    }

    // Word-level matching for better natural language support
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    
    let matchCount = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (this.levenshteinDistance(word1, word2) <= 1) {
          matchCount++;
          break;
        }
      }
    }

    const wordScore = matchCount / Math.max(words1.length, words2.length);

    // Also do character-level similarity
    const charScore = this.levenshteinSimilarity(str1, str2);

    // Return weighted average favoring word matching
    return wordScore * 0.7 + charScore * 0.3;
  }

  private levenshteinSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(a: string, b: string): number {
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

    return matrix[b.length][a.length];
  }

  getIntent(intentId: string): VoiceIntent | undefined {
    return this.intents.find(i => i.id === intentId);
  }

  getAllIntents(offlineOnly: boolean = false): VoiceIntent[] {
    if (offlineOnly) {
      return this.intents.filter(i => i.offline);
    }
    return this.intents;
  }

  private saveToCache(): void {
    try {
      const cacheData: Record<string, any> = {};
      this.cachedIntents.forEach((value, key) => {
        cacheData[key] = value;
      });
      localStorage.setItem('voice_intents_cache', JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error saving intents to cache:', error);
    }
  }

  private loadFromCache(): void {
    try {
      const cached = localStorage.getItem('voice_intents_cache');
      if (cached) {
        const cacheData = JSON.parse(cached);
        Object.entries(cacheData).forEach(([key, value]) => {
          this.cachedIntents.set(key, value as VoiceIntent[]);
        });
      }
    } catch (error) {
      console.error('Error loading intents from cache:', error);
    }
  }

  async callAIFallback(
    transcript: string,
    language: string,
    context?: Record<string, any>
  ): Promise<any> {
    try {
      // Get tenant and user context
      const tenantId = context?.tenantId || localStorage.getItem('tenant_id');
      const userId = context?.userId || localStorage.getItem('user_id');

      const { data, error } = await supabase.functions.invoke('voice-navigation-agent', {
        body: {
          transcript,
          language,
          context,
        },
        headers: {
          ...(tenantId && { 'x-tenant-id': tenantId }),
          ...(userId && { 'x-farmer-id': userId })
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('AI fallback error:', error);
      return null;
    }
  }
}
