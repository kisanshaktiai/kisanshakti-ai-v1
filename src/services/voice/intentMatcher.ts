import { VoiceIntent, VoiceUtterance } from './types';

// Simple similarity scoring using Levenshtein distance
function levenshteinDistance(a: string, b: string): number {
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

function similarity(a: string, b: string): number {
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}

export class IntentMatcher {
  private intents: VoiceIntent[] = [];
  private language: string = 'en';

  async loadIntents(language: string): Promise<void> {
    this.language = language;
    try {
      const module = await import(`./intents/${language}.json`);
      this.intents = (module.intents || []) as VoiceIntent[];
    } catch (error) {
      console.warn(`Failed to load intents for ${language}, falling back to English`);
      const module = await import('./intents/en.json');
      this.intents = (module.intents || []) as VoiceIntent[];
    }
  }

  matchIntent(transcript: string, isOffline: boolean = false): VoiceUtterance | null {
    const normalizedTranscript = transcript.toLowerCase().trim();
    
    let bestMatch: { intent: VoiceIntent; confidence: number } | null = null;

    for (const intent of this.intents) {
      // Skip cloud-only intents when offline
      if (isOffline && !intent.offline) {
        continue;
      }

      for (const pattern of intent.patterns) {
        const confidence = similarity(normalizedTranscript, pattern.toLowerCase());
        
        if (confidence > 0.6 && (!bestMatch || confidence > bestMatch.confidence)) {
          bestMatch = { intent, confidence };
        }
      }
    }

    if (!bestMatch) {
      return null;
    }

    return {
      text: transcript,
      intent: bestMatch.intent.id,
      confidence: bestMatch.confidence,
      language: this.language,
      timestamp: Date.now(),
    };
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

  getExamples(): string[] {
    try {
      // This will be loaded dynamically based on language
      return [];
    } catch {
      return [];
    }
  }
}
