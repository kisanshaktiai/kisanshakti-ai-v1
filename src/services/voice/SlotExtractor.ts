/**
 * SlotExtractor - Extracts parameters/slots from voice commands
 * Handles various data types: strings, numbers, dates, enums
 */

import { VoiceSlot } from './types';

export interface ExtractedSlots {
  [key: string]: any;
}

export interface SlotPattern {
  name: string;
  type: 'string' | 'number' | 'date' | 'enum' | 'id';
  required: boolean;
  patterns: RegExp[];
  enumValues?: string[];
  multiLang?: Record<string, string[]>; // For enum values in different languages
}

export class SlotExtractor {
  private language: string = 'en';

  constructor(language: string = 'en') {
    this.language = language;
  }

  setLanguage(language: string): void {
    this.language = language;
  }

  /**
   * Extract slots from transcript based on slot definitions
   */
  extractSlots(transcript: string, slots: VoiceSlot[]): ExtractedSlots {
    const extracted: ExtractedSlots = {};
    const normalizedTranscript = transcript.toLowerCase().trim();

    for (const slot of slots) {
      const value = this.extractSlot(normalizedTranscript, slot);
      if (value !== null) {
        extracted[slot.name] = value;
      }
    }

    return extracted;
  }

  private extractSlot(transcript: string, slot: VoiceSlot): any {
    switch (slot.type) {
      case 'number':
        return this.extractNumber(transcript);
      case 'date':
        return this.extractDate(transcript);
      case 'enum':
        return this.extractEnum(transcript, slot.values || []);
      case 'string':
      default:
        return this.extractString(transcript, slot.name);
    }
  }

  // ============ Number Extraction ============

  private extractNumber(transcript: string): number | null {
    // Extract numeric patterns
    const patterns = [
      /\b(\d+)\b/, // Direct numbers: "123"
      /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i, // Word numbers
      /\b(एक|दो|तीन|चार|पांच|छह|सात|आठ|नौ|दस)\b/i, // Hindi numbers
    ];

    for (const pattern of patterns) {
      const match = transcript.match(pattern);
      if (match) {
        return this.parseNumber(match[1]);
      }
    }

    return null;
  }

  private parseNumber(numStr: string): number {
    // Try direct parse
    const direct = parseInt(numStr, 10);
    if (!isNaN(direct)) return direct;

    // Word to number mapping
    const wordMap: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5,
      छह: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
    };

    return wordMap[numStr.toLowerCase()] || 0;
  }

  // ============ Date Extraction ============

  private extractDate(transcript: string): Date | null {
    const now = new Date();

    // Relative dates
    if (this.matchesPattern(transcript, ['today', 'आज'])) {
      return now;
    }

    if (this.matchesPattern(transcript, ['tomorrow', 'कल'])) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    if (this.matchesPattern(transcript, ['yesterday', 'कल'])) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }

    // Next week
    if (this.matchesPattern(transcript, ['next week', 'अगले सप्ताह'])) {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    }

    // Specific date patterns (DD/MM/YYYY or DD-MM-YYYY)
    const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
    const match = transcript.match(datePattern);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
      const year = parseInt(match[3], 10);
      return new Date(year, month, day);
    }

    return null;
  }

  // ============ Enum Extraction ============

  private extractEnum(transcript: string, values: string[]): string | null {
    const normalized = transcript.toLowerCase();

    for (const value of values) {
      if (normalized.includes(value.toLowerCase())) {
        return value;
      }
    }

    return null;
  }

  // ============ String Extraction ============

  private extractString(transcript: string, slotName: string): string | null {
    // Common patterns for string extraction
    const patterns = [
      // "name is X" or "named X"
      new RegExp(`(?:name is|named|called|नाम है)\\s+([\\w\\s]+)`, 'i'),
      // "title X" or "X title"
      new RegExp(`(?:title|शीर्षक)\\s+([\\w\\s]+)`, 'i'),
      // Generic quoted strings
      /"([^"]+)"/,
      /'([^']+)'/,
    ];

    for (const pattern of patterns) {
      const match = transcript.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // If no pattern matched, try to extract the most relevant word/phrase
    return this.extractRelevantPhrase(transcript, slotName);
  }

  private extractRelevantPhrase(transcript: string, slotName: string): string | null {
    // Remove common command words to get the content
    const commandWords = [
      'create', 'add', 'edit', 'update', 'delete', 'remove', 'open', 'show',
      'बनाओ', 'जोड़ो', 'संपादित', 'अपडेट', 'हटाओ', 'खोलो', 'दिखाओ',
    ];

    let cleaned = transcript.toLowerCase();
    for (const word of commandWords) {
      cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
    }

    cleaned = cleaned.trim();
    return cleaned.length > 0 ? cleaned : null;
  }

  // ============ ID Extraction ============

  extractId(transcript: string): string | null {
    // Extract UUID patterns
    const uuidPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
    const uuidMatch = transcript.match(uuidPattern);
    if (uuidMatch) {
      return uuidMatch[0];
    }

    // Extract "id 123" or "number 123" patterns
    const idPatterns = [
      /\b(?:id|number|आईडी|नंबर)\s+(\w+)/i,
      /\b(\d+)\b/, // Fallback to any number
    ];

    for (const pattern of idPatterns) {
      const match = transcript.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  // ============ Land/Field Name Extraction ============

  extractLandName(transcript: string): string | null {
    const patterns = [
      /\b(?:land|field|farm|खेत|जमीन)\s+(?:named|called|नाम|है)\s+([^\s]+)/i,
      /"([^"]+)"\s*(?:land|field|farm|खेत|जमीन)/i,
    ];

    for (const pattern of patterns) {
      const match = transcript.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  // ============ Crop Name Extraction ============

  extractCropName(transcript: string): string | null {
    const commonCrops = [
      // English
      'wheat', 'rice', 'corn', 'cotton', 'sugarcane', 'potato', 'tomato',
      'onion', 'garlic', 'maize', 'soybean', 'mustard', 'chickpea',
      // Hindi
      'गेहूं', 'चावल', 'मक्का', 'कपास', 'गन्ना', 'आलू', 'टमाटर',
      'प्याज', 'लहसुन', 'सोयाबीन', 'सरसों', 'चना',
    ];

    const normalized = transcript.toLowerCase();

    for (const crop of commonCrops) {
      if (normalized.includes(crop)) {
        return crop;
      }
    }

    // Try to extract crop from patterns
    const patterns = [
      /\b(?:crop|फसल)\s+(?:is|named|called|है)\s+([^\s]+)/i,
      /\b(?:growing|उगा रहे)\s+([^\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = transcript.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  // ============ Action/Priority Extraction ============

  extractPriority(transcript: string): 'low' | 'medium' | 'high' | null {
    const priorityMap: Record<string, 'low' | 'medium' | 'high'> = {
      low: 'low',
      medium: 'medium',
      high: 'high',
      urgent: 'high',
      important: 'high',
      normal: 'medium',
      कम: 'low',
      मध्यम: 'medium',
      अधिक: 'high',
      जरूरी: 'high',
    };

    const normalized = transcript.toLowerCase();

    for (const [key, value] of Object.entries(priorityMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }

    return null;
  }

  // ============ Helpers ============

  private matchesPattern(text: string, patterns: string[]): boolean {
    const normalized = text.toLowerCase();
    return patterns.some(pattern => normalized.includes(pattern.toLowerCase()));
  }

  /**
   * Extract all potential entities from transcript
   * Useful for complex commands with multiple parameters
   */
  extractAll(transcript: string): ExtractedSlots {
    const slots: ExtractedSlots = {};

    const id = this.extractId(transcript);
    if (id) slots.id = id;

    const number = this.extractNumber(transcript);
    if (number !== null) slots.number = number;

    const date = this.extractDate(transcript);
    if (date) slots.date = date;

    const landName = this.extractLandName(transcript);
    if (landName) slots.landName = landName;

    const cropName = this.extractCropName(transcript);
    if (cropName) slots.cropName = cropName;

    const priority = this.extractPriority(transcript);
    if (priority) slots.priority = priority;

    return slots;
  }
}
