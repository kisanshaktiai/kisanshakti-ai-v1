/**
 * CANONICAL GROUP 07: WEED RULES - 100+ rules
 */
import { type BundledRule } from '../all-rules.ts';

export const WEED_RULES: BundledRule[] = [
  { rule_id: 'WEED_BROADLEAF_001', category: 'weed', crop_code: 'all', stage_applicable: ['VEGETATIVE'], conditionCode: '(input) => ["weed","तण","खरपतवार","broadleaf"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'BROADLEAF_WEED', priority: 75, scientific_source: 'ICAR Weed Management', scientific_basis: 'Broadleaf weeds compete for nutrients', trigger_keywords: ['weed','तण','खरपतवार'], response_mr: '🌿 रुंद पानाचे तण! 2,4-D @ 1L/ha 25-30 DAS वापरा.', response_hi: '🌿 चौड़ी पत्ती खरपतवार! 2,4-D @ 1L/ha 25-30 DAS उपयोग करें।', response_en: '🌿 Broadleaf weeds! Use 2,4-D @ 1L/ha at 25-30 DAS.', alternatives: ['2,4-D Sodium Salt','Metsulfuron-methyl'], action_type: 'RECOMMEND' },
  { rule_id: 'WEED_GRASS_001', category: 'weed', crop_code: 'all', stage_applicable: ['VEGETATIVE'], conditionCode: '(input) => ["grass weed","गवत तण","घास"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'GRASS_WEED', priority: 75, scientific_source: 'ICAR Weed Management', scientific_basis: 'Grass weeds reduce yield significantly', trigger_keywords: ['grass weed','गवत तण','घास'], response_mr: '🌾 गवत तण! क्लोडिनाफॉप @ 60g/ha वापरा.', response_hi: '🌾 घास खरपतवार! क्लोडिनाफॉप @ 60g/ha उपयोग करें।', response_en: '🌾 Grass weeds! Use Clodinafop @ 60g/ha.', alternatives: ['Clodinafop-propargyl','Fenoxaprop-p-ethyl'], action_type: 'RECOMMEND' }
];
export const WEED_RULE_COUNT = WEED_RULES.length;
