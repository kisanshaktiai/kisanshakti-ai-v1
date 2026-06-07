/**
 * Phase 1-3 regression tests for NEXT_CROP_RECOMMENDATION routing.
 *
 * Validates the language-agnostic pre-classifier regex (isNextCropRecommendationQuery)
 * across Marathi, Hindi, English (Devanagari + romanized) — this is the gatekeeper
 * that:
 *   (a) prevents the Static Data Gate from intercepting advisory queries as CROP_NAME
 *   (b) bypasses the NO_ACTIVE_CROP short-circuit so the symbolic brain can answer
 *
 * Critical: false positives are worse than false negatives. A factual lookup
 * ("which crop is in this field?" / "what was previously grown?") MUST NOT match.
 */

import { describe, it, expect } from 'vitest';

// Re-implement the regex here so tests don't require Deno runtime / supabase imports.
// Keep this in EXACT sync with NEXT_CROP_RECOMMENDATION_PATTERNS in orchestrator.ts.
const NEXT_CROP_RECOMMENDATION_PATTERNS: RegExp[] = [
  /नवीन\s*(पीक|पिक)/i,
  /(पीक|पिक)\s*(घ्यावे|घेवू|घेऊ|लावावे|लावू|पेरू|पेरावे|सुचवा|सुचव)/i,
  /(कोणते|कोणतं|कोणती)\s*(नवीन\s*)?(पीक|पिक).*(घेवू|घ्यावे|लावावे|पेरू|पेरावे|योग्य|फायदेशीर|सुचव)/i,
  /पुढील\s*(पीक|पिक)/i,
  /आता\s*(काय|कोणते)\s*(पेरू|पेरावे|लावावे|घेवू)/i,
  /फायदेशीर\s*(पीक|पिक)/i,
  /(कौन\s*सी?|क्या)\s*(नई\s*)?फसल\s*(लगाऊं|बोऊं|उगाऊं|लगाएं|बोएं|सुझाव|सुझाओ|बताओ)/i,
  /अगली\s*फसल/i,
  /नई\s*फसल/i,
  /क्या\s*(बोऊं|बोएं|लगाऊं|उगाऊं)/i,
  /\b(what|which|recommend(ed)?|suggest|best)\b[^?.!\n]{0,40}\b(crop|plant)\b[^?.!\n]{0,40}\b(grow|plant|sow|next|after|recommend|suggest|best)\b/i,
  /\bnext\s+crop\b/i,
  /\bwhat\s+(should\s+i|to)\s+(plant|sow|grow)\b/i,
  /\brecommend\s+(a\s+)?crop\b/i,
  /\b(navin|nava|nayi)\s+(pik|pīk|fasal|fasl)\b/i,
  /\b(kon|kaun)\s*(sa|si|te|ta|t[ií])\s+(pik|fasal)\b[^?.!\n]{0,30}\b(ghyave|ghevu|lavave|peru|lagau|boyu|bou)/i,
];

function isNextCropRecommendationQuery(message: string | null | undefined): boolean {
  if (!message || typeof message !== 'string') return false;
  const m = message.trim();
  if (!m) return false;
  return NEXT_CROP_RECOMMENDATION_PATTERNS.some((re) => re.test(m));
}

describe('NEXT_CROP_RECOMMENDATION pre-classifier', () => {
  describe('MUST match — Marathi recommendation queries', () => {
    const yes = [
      'या शेतात कोणते नवीन पिक घेवू?',
      'या शेतात कोणते नवीन पीक घेवू?',
      'कोणते पीक घ्यावे',
      'पुढील पीक कोणते',
      'नवीन पीक सुचवा',
      'आता काय पेरू',
      'फायदेशीर पीक सांगा',
      'या शेतात कोणते पीक योग्य आहे',
    ];
    yes.forEach((q) => it(q, () => expect(isNextCropRecommendationQuery(q)).toBe(true)));
  });

  describe('MUST match — Hindi recommendation queries', () => {
    const yes = [
      'कौन सी फसल लगाऊं',
      'अगली फसल कौन सी',
      'क्या बोऊं',
      'नई फसल बताओ',
      'कौन सी नई फसल लगाऊं',
    ];
    yes.forEach((q) => it(q, () => expect(isNextCropRecommendationQuery(q)).toBe(true)));
  });

  describe('MUST match — English recommendation queries', () => {
    const yes = [
      'What crop should I grow next',
      'Which crop is best to plant next',
      'Recommend a crop for this field',
      'What should I plant next',
      'Best crop to grow after wheat',
      'next crop suggestion please',
    ];
    yes.forEach((q) => it(q, () => expect(isNextCropRecommendationQuery(q)).toBe(true)));
  });

  describe('MUST NOT match — factual CROP_NAME lookups (no recommendation intent)', () => {
    const no = [
      'या शेतात कोणते पीक आहे?',           // "which crop is in this field?"
      'या शेतात कोणतं पीक होतं?',          // "which crop was here?" (past)
      'इस खेत में कौन सी फसल है',          // "which crop is in this field?"
      'पिछली फसल क्या थी',                  // "what was the previous crop?"
      'tell me the crop in this field',
      'what crop is currently planted',
      'last crop on this land',
    ];
    no.forEach((q) => it(q, () => expect(isNextCropRecommendationQuery(q)).toBe(false)));
  });

  describe('MUST NOT match — diagnostic / other intents', () => {
    const no = [
      'पाने पिवळी पडत आहेत',                // yellowing
      'किडे लागले आहेत',                     // pests
      'खत कोणते द्यावे',                     // fertilizer (different intent)
      'when to harvest sugarcane',
      'soil test results',
      '',
      '   ',
    ];
    no.forEach((q) => it(q || '(empty)', () => expect(isNextCropRecommendationQuery(q)).toBe(false)));
  });
});
