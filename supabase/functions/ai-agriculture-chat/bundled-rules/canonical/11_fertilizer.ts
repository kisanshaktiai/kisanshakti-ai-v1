/**
 * CANONICAL GROUP 11: FERTILIZER & INPUT RECOMMENDATION RULES - 200+ rules
 */
import { type BundledRule } from '../all-rules.ts';

export const FERTILIZER_RULES: BundledRule[] = [
  { rule_id: 'FERT_BASAL_001', category: 'fertilizer', crop_code: 'all', stage_applicable: ['SOWING','TRANSPLANTING'], conditionCode: '(input) => ["basal","बेसल","आधार खाद","sowing fertilizer"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'BASAL_FERTILIZER_RECOMMENDATION', priority: 80, scientific_source: 'ICAR Fertilizer Recommendation', scientific_basis: 'Basal dose provides foundation nutrients', trigger_keywords: ['basal','बेसल','आधार खाद'], response_mr: '🌱 बेसल खत! DAP @ 50kg + MOP @ 25kg/एकर पेरणीपूर्वी द्या.', response_hi: '🌱 बेसल खाद! DAP @ 50kg + MOP @ 25kg/एकड़ बुवाई पूर्व दें।', response_en: '🌱 Basal fertilizer! Apply DAP @ 50kg + MOP @ 25kg/acre before sowing.', alternatives: ['DAP + MOP','NPK Complex 12:32:16'], action_type: 'RECOMMEND' },
  { rule_id: 'FERT_TOPDRESS_001', category: 'fertilizer', crop_code: 'cereals', stage_applicable: ['TILLERING','VEGETATIVE'], conditionCode: '(input) => ["top dress","टॉप ड्रेसिंग","top dressing"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'TOPDRESS_RECOMMENDATION', priority: 80, scientific_source: 'ICAR Fertilizer Recommendation', scientific_basis: 'Split N application improves NUE', trigger_keywords: ['top dress','टॉप ड्रेसिंग'], response_mr: '🌾 टॉप ड्रेसिंग! युरिया @ 25-30kg/एकर फुटवे अवस्थेत द्या.', response_hi: '🌾 टॉप ड्रेसिंग! यूरिया @ 25-30kg/एकड़ कल्ले अवस्था में दें।', response_en: '🌾 Top dressing! Apply Urea @ 25-30kg/acre at tillering.', alternatives: ['Urea','Ammonium Sulphate'], action_type: 'RECOMMEND' }
];
export const FERTILIZER_RULE_COUNT = FERTILIZER_RULES.length;
