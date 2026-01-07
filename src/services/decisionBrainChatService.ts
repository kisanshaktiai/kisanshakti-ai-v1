/**
 * @deprecated This file has been deprecated in favor of the backend 9-agent orchestrator.
 * All chat logic now flows through supabase/functions/ai-agriculture-chat
 * 
 * Kept for reference only - do not use in production.
 * See: supabase/functions/ai-agriculture-chat/agents/orchestrator.ts
 */

export const DEPRECATED_MESSAGE = 'This module has been deprecated. Use the 9-agent orchestrator instead.';

// Re-export types that other files might depend on
export interface LandContext {
  land_id: string;
  land_name?: string;
  id?: string;
  name?: string;
  crop_code?: string;
  crop_group?: string;
  crop_stage?: string;
  crop_name?: string;
  current_crop?: string;
  sowing_date?: string;
  cultivation_date?: string | Date;
  area_hectares?: number;
  area_acres?: number;
  farming_mode?: string;
  irrigation_type?: string;
  location?: {
    state?: string;
    district?: string;
    latitude?: number;
    longitude?: number;
  };
  soil_data?: {
    n?: number;
    p?: number;
    k?: number;
    ph?: number;
    organic_carbon?: number;
    moisture?: number;
    test_date?: string | Date;
  };
  ndvi_data?: {
    value?: number;
    trend?: number;
    timestamp?: string | Date;
  };
  weather_data?: {
    temperature?: number;
    humidity?: number;
    rain_expected?: boolean;
    rain_expected_hours?: number;
    wind_speed?: number;
    timestamp?: string | Date;
  };
}

// Empty placeholder exports to prevent import errors in dependent files
export function getDecisionBrainResponse() {
  throw new Error(DEPRECATED_MESSAGE);
}
