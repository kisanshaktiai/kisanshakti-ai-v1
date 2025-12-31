/**
 * Intent Matching Unit Tests
 * Tests intent matching accuracy and slot extraction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SlotExtractor } from '@/services/voice/SlotExtractor';
import { LanguageDetector } from '@/services/voice/LanguageDetector';

describe('Intent Matching Tests', () => {
  describe('Slot Extraction', () => {
    let extractor: SlotExtractor;

    beforeEach(() => {
      extractor = new SlotExtractor('en');
    });

    describe('Number Extraction', () => {
      it('should extract numeric values', () => {
        const number = extractor.extractNumber('add 5 hectares');
        expect(number).toBe(5);
      });

      it('should extract word numbers', () => {
        const number = extractor.extractNumber('add three fields');
        expect(number).toBe(3);
      });

      it('should handle Hindi numbers', () => {
        extractor.setLanguage('hi');
        const number = extractor.extractNumber('पांच खेत जोड़ो');
        expect(number).toBe(5);
      });
    });

    describe('Date Extraction', () => {
      it('should extract relative dates', () => {
        const today = extractor.extractDate('schedule for today');
        expect(today).toBeInstanceOf(Date);
      });

      it('should extract "tomorrow"', () => {
        const tomorrow = extractor.extractDate('schedule for tomorrow');
        expect(tomorrow).toBeInstanceOf(Date);
        
        const expectedDate = new Date();
        expectedDate.setDate(expectedDate.getDate() + 1);
        expect(tomorrow?.getDate()).toBe(expectedDate.getDate());
      });

      it('should extract specific dates', () => {
        const date = extractor.extractDate('schedule for 15/03/2024');
        expect(date).toBeInstanceOf(Date);
        expect(date?.getDate()).toBe(15);
        expect(date?.getMonth()).toBe(2); // March (0-indexed)
      });
    });

    describe('ID Extraction', () => {
      it('should extract numeric IDs', () => {
        const id = extractor.extractId('delete land id 123');
        expect(id).toBe('123');
      });

      it('should extract UUID patterns', () => {
        const uuid = 'abc12345-1234-5678-9abc-123456789abc';
        const id = extractor.extractId(`edit land ${uuid}`);
        expect(id).toBe(uuid);
      });
    });

    describe('Crop Name Extraction', () => {
      it('should extract common crop names', () => {
        const crop = extractor.extractCropName('I am growing wheat');
        expect(crop).toBe('wheat');
      });

      it('should extract Hindi crop names', () => {
        extractor.setLanguage('hi');
        const crop = extractor.extractCropName('मैं गेहूं उगा रहा हूं');
        expect(crop).toBe('गेहूं');
      });

      it('should handle multiple crop names', () => {
        const crop = extractor.extractCropName('planting rice and wheat');
        // Should extract the first one
        expect(crop).toBeTruthy();
      });
    });

    describe('Land Name Extraction', () => {
      it('should extract quoted land names', () => {
        const name = extractor.extractLandName('land named "North Field"');
        expect(name).toBe('North Field');
      });

      it('should extract land names without quotes', () => {
        const name = extractor.extractLandName('land called NorthField');
        expect(name).toBeTruthy();
      });
    });

    describe('Priority Extraction', () => {
      it('should extract priority levels', () => {
        const priority = extractor.extractPriority('high priority task');
        expect(priority).toBe('high');
      });

      it('should handle "urgent" as high priority', () => {
        const priority = extractor.extractPriority('urgent task');
        expect(priority).toBe('high');
      });

      it('should handle Hindi priority', () => {
        extractor.setLanguage('hi');
        const priority = extractor.extractPriority('जरूरी काम');
        expect(priority).toBe('high');
      });
    });

    describe('Complete Slot Extraction', () => {
      it('should extract all slots from complex command', () => {
        const transcript = 'create land named "Test Field" with 5 hectares growing wheat';
        const slots = extractor.extractAll(transcript);

        expect(slots.landName).toBe('Test Field');
        expect(slots.number).toBe(5);
        expect(slots.cropName).toBe('wheat');
      });
    });
  });

  describe('Language Detection', () => {
    let detector: LanguageDetector;

    beforeEach(() => {
      detector = new LanguageDetector();
    });

    it('should detect English text', () => {
      const result = detector.detectLanguage('go to home page');
      expect(result.primaryLanguage).toBe('en');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect Hindi text', () => {
      const result = detector.detectLanguage('घर जाओ');
      expect(result.primaryLanguage).toBe('hi');
    });

    it('should detect code-switching', () => {
      const result = detector.detectLanguage('go home जाओ please');
      expect(result.isCodeSwitching).toBe(true);
      expect(result.languages).toContain('en');
      expect(result.languages).toContain('hi');
    });

    it('should detect Marathi text', () => {
      const result = detector.detectLanguage('घर जा');
      expect(result.primaryLanguage).toBe('mr');
    });

    it('should handle mixed scripts', () => {
      const result = detector.detectLanguage('delete land नंबर 123');
      expect(result.isCodeSwitching).toBe(true);
    });
  });

  describe('Pattern Matching', () => {
    it('should match exact patterns', () => {
      const patterns = ['go home', 'take me home', 'home page'];
      const transcript = 'go home';
      const match = patterns.some(p => transcript.toLowerCase().includes(p));
      expect(match).toBe(true);
    });

    it('should match partial patterns', () => {
      const patterns = ['show my lands', 'view lands', 'open lands'];
      const transcript = 'please show my lands now';
      const match = patterns.some(p => transcript.toLowerCase().includes(p));
      expect(match).toBe(true);
    });

    it('should handle word boundaries', () => {
      const pattern = 'home';
      const transcript1 = 'go home';
      const transcript2 = 'homework';

      const regex = new RegExp(`\\b${pattern}\\b`, 'i');
      expect(regex.test(transcript1)).toBe(true);
      expect(regex.test(transcript2)).toBe(false);
    });
  });

  describe('Confidence Scoring', () => {
    it('should calculate similarity scores', () => {
      const calculateSimilarity = (str1: string, str2: string): number => {
        const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
        const maxLength = Math.max(str1.length, str2.length);
        return maxLength === 0 ? 1 : 1 - distance / maxLength;
      };

      const similarity1 = calculateSimilarity('go home', 'go home');
      expect(similarity1).toBe(1);

      const similarity2 = calculateSimilarity('go home', 'go back');
      expect(similarity2).toBeLessThan(1);
      expect(similarity2).toBeGreaterThan(0);
    });
  });
});

// Helper function for Levenshtein distance
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
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

  return matrix[len1][len2];
}
