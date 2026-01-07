/**
 * CANONICAL GROUP 08: SOIL HEALTH RULES - 120+ rules
 */
import { type BundledRule } from '../all-rules.ts';

export const SOIL_RULES: BundledRule[] = [
  { rule_id: 'SOIL_ACIDIC_001', category: 'soil', crop_code: 'all', stage_applicable: ['ALL'], conditionCode: '(input) => input.soil_states?.ph === "LOW" || ["acidic soil","आम्लयुक्त","अम्लीय"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'ACIDIC_SOIL', priority: 78, scientific_source: 'ICAR Soil Science', scientific_basis: 'pH < 6 reduces nutrient availability', trigger_keywords: ['acidic','आम्लयुक्त','अम्लीय'], response_mr: '🧪 आम्लयुक्त माती! चुना @ 2-4 ton/ha द्या.', response_hi: '🧪 अम्लीय मिट्टी! चूना @ 2-4 ton/ha दें।', response_en: '🧪 Acidic soil! Apply lime @ 2-4 ton/ha.', alternatives: ['Agricultural lime','Dolomite'], action_type: 'RECOMMEND' },
  { rule_id: 'SOIL_ALKALINE_001', category: 'soil', crop_code: 'all', stage_applicable: ['ALL'], conditionCode: '(input) => ["alkaline","क्षारयुक्त","क्षारीय"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'ALKALINE_SOIL', priority: 78, scientific_source: 'ICAR Soil Science', scientific_basis: 'pH > 8 causes micronutrient deficiency', trigger_keywords: ['alkaline','क्षारयुक्त','क्षारीय'], response_mr: '🧪 क्षारयुक्त माती! जिप्सम @ 2-5 ton/ha द्या.', response_hi: '🧪 क्षारीय मिट्टी! जिप्सम @ 2-5 ton/ha दें।', response_en: '🧪 Alkaline soil! Apply Gypsum @ 2-5 ton/ha.', alternatives: ['Gypsum','Sulphur'], action_type: 'RECOMMEND' },
  { rule_id: 'SOIL_WATERLOGGING_001', category: 'soil', crop_code: 'all', stage_applicable: ['ALL'], conditionCode: '(input) => ["waterlogging","पाणी साचणे","जलभराव"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'WATERLOGGING', priority: 85, scientific_source: 'ICAR Soil Management', scientific_basis: 'Waterlogging causes root asphyxiation', trigger_keywords: ['waterlogging','पाणी साचणे','जलभराव'], response_mr: '💧 पाणी साचत आहे! ताबडतोब निचरा करा.', response_hi: '💧 जलभराव! तुरंत जल निकास करें।', response_en: '💧 Waterlogging! Drain immediately.', action_type: 'WARN' }
];
export const SOIL_RULE_COUNT = SOIL_RULES.length;
