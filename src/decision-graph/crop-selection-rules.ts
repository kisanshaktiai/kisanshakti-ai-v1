/**
 * @deprecated MIGRATED TO BACKEND
 * See: supabase/functions/ai-agriculture-chat/source-rules/crop-selection-rules.ts
 * 
 * This file now exports types only. All rule logic is in the backend.
 */

import { CropGroup } from './types';

export interface CropRecommendation {
  crop_code: string;
  crop_name: string;
  crop_name_mr: string;
  crop_name_hi: string;
  crop_group: CropGroup;
  suitability_score: number;
  sowing_window: { start_month: number; end_month: number; optimal_days: string; };
  expected_duration_days: number;
  estimated_yield_per_acre: string;
  estimated_cost_per_acre: number;
  estimated_revenue_per_acre: number;
  water_requirement: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
  warnings: string[];
  rotation_benefit: string;
  source_rules: string[];
}

export interface CropSelectionInput {
  previous_crop?: string;
  previous_crop_group?: CropGroup;
  current_month: number;
  language: string;
}

export interface CropSelectionResult {
  recommendations: CropRecommendation[];
  rotation_warnings: string[];
  soil_limitations: string[];
  confidence: number;
  rules_applied: string[];
}

console.warn('[DEPRECATED] crop-selection-rules.ts - Logic migrated to backend');
