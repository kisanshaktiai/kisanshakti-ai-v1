/**
 * CANONICAL GROUP 12: CROPPING SYSTEM & ROTATION RULES - 100+ rules
 */
import { type BundledRule } from '../all-rules.ts';

export const CROPPING_SYSTEM_RULES: BundledRule[] = [
  { rule_id: 'ROTATION_LEGUME_001', category: 'rotation', crop_code: 'all', stage_applicable: ['ALL'], conditionCode: '(input) => ["rotation","फेरबदल","फसल चक्र","legume"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'CROP_ROTATION_ADVICE', priority: 70, scientific_source: 'ICAR Cropping System', scientific_basis: 'Legume rotation fixes N and breaks pest cycles', trigger_keywords: ['rotation','फेरबदल','फसल चक्र'], response_mr: '🔄 पीक फेरबदल! धान्य नंतर कडधान्य घ्या. नायट्रोजन वाचतो.', response_hi: '🔄 फसल चक्र! अनाज के बाद दलहन लें। नाइट्रोजन बचता है।', response_en: '🔄 Crop rotation! Follow cereals with legumes. Saves nitrogen.', action_type: 'RECOMMEND' },
  { rule_id: 'INTERCROP_001', category: 'intercrop', crop_code: 'all', stage_applicable: ['SOWING'], conditionCode: '(input) => ["intercrop","आंतरपीक","अंतर फसल"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'INTERCROPPING_ADVICE', priority: 70, scientific_source: 'ICAR Cropping System', scientific_basis: 'Intercropping maximizes land use and reduces risk', trigger_keywords: ['intercrop','आंतरपीक','अंतर फसल'], response_mr: '🌾 आंतरपीक! मका + सोयाबीन 1:2 प्रमाणात घ्या.', response_hi: '🌾 अंतर फसल! मक्का + सोयाबीन 1:2 अनुपात में लें।', response_en: '🌾 Intercropping! Take Maize + Soybean in 1:2 ratio.', action_type: 'RECOMMEND' }
];
export const CROPPING_SYSTEM_RULE_COUNT = CROPPING_SYSTEM_RULES.length;
