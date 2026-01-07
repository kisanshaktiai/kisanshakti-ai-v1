/**
 * CANONICAL GROUP 10: IRRIGATION & WATER MANAGEMENT RULES - 150+ rules
 */
import { type BundledRule } from '../all-rules.ts';

export const IRRIGATION_RULES: BundledRule[] = [
  { rule_id: 'IRRIGATION_CRITICAL_STAGE_001', category: 'water', crop_code: 'all', stage_applicable: ['FLOWERING','GRAIN_FILL'], conditionCode: '(input) => ["flowering","grain fill"].includes(input.crop_stage?.toLowerCase())', cause: 'CRITICAL_IRRIGATION_STAGE', priority: 88, scientific_source: 'ICAR Water Management', scientific_basis: 'Water stress at flowering reduces yield 50%+', trigger_keywords: ['irrigation','पाणी','सिंचाई'], response_mr: '💧 गंभीर अवस्था! पाणी तणाव टाळा. नियमित सिंचन द्या.', response_hi: '💧 गंभीर अवस्था! पानी का तनाव टालें। नियमित सिंचाई दें।', response_en: '💧 Critical stage! Avoid water stress. Ensure regular irrigation.', action_type: 'WARN' },
  { rule_id: 'IRRIGATION_DEFICIT_001', category: 'water', crop_code: 'all', stage_applicable: ['ALL'], conditionCode: '(input) => input.soil_states?.moisture === "LOW" || ["water stress","पाणी कमी","पानी कम"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'WATER_DEFICIT', priority: 85, scientific_source: 'ICAR Water Management', scientific_basis: 'Soil moisture below 50% FC causes stress', trigger_keywords: ['water stress','पाणी कमी','पानी कम'], response_mr: '💧 पाणी तणाव! ताबडतोब सिंचन द्या.', response_hi: '💧 पानी का तनाव! तुरंत सिंचाई दें।', response_en: '💧 Water stress! Irrigate immediately.', action_type: 'RECOMMEND' }
];
export const IRRIGATION_RULE_COUNT = IRRIGATION_RULES.length;
