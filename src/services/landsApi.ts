import { supabase } from '@/utils/supabase';
import { useAuthStore } from '@/stores/authStore';
import { dataIsolation, isolatedSupabase } from './dataIsolationService';
import { SUPABASE_CONFIG, getSupabaseFunctionUrl } from '@/config/supabase';

const LANDS_API_URL = getSupabaseFunctionUrl('lands-api');
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

interface LandData {
  id?: string;
  name: string;
  ownership_type: string;
  area_acres: number;
  survey_number?: string;
  state?: string;
  district?: string;
  taluka?: string;
  village?: string;
  soil_type?: string;
  water_source?: string;
  irrigation_type?: string;
  current_crop?: string;
  previous_crop?: string;
  cultivation_date?: string;
  last_harvest_date?: string;
  area_guntas?: number;
  area_sqft?: number;
  boundary_polygon_old?: any;
  center_point_old?: any;
  boundary_method?: string;
  gps_accuracy_meters?: number;
  gps_recorded_at?: string;
  is_active?: boolean;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

class LandsApiService {
  private async getHeaders(): Promise<HeadersInit> {
    // Wait for context to be available (handles race condition during app init)
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const { tenantId, farmerId, isValid } = dataIsolation.getIsolationContext();
      
      if (isValid && tenantId && farmerId) {
        const headers = dataIsolation.getIsolationHeaders();
        console.log('🌐 [LandsAPI] Headers ready:', { 
          tenantId: headers['x-tenant-id'], 
          farmerId: headers['x-farmer-id'] 
        });
        return {
          ...headers,
          'apikey': SUPABASE_CONFIG.ANON_KEY
        };
      }
      
      console.log(`🌐 [LandsAPI] Waiting for context (attempt ${attempts + 1}/${maxAttempts})...`);
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }
    
    console.error('❌ [LandsAPI] Context never became valid after waiting');
    throw new Error('Please ensure you are logged in before managing lands');
  }

  private async fetchWithRetry(
    url: string, 
    options: RequestInit, 
    retries = MAX_RETRIES
  ): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(url, options);
        return response;
      } catch (error) {
        lastError = error as Error;
        console.warn(`🌐 [LandsAPI] Fetch failed (attempt ${i + 1}/${retries + 1}):`, error);
        
        if (i < retries) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
        }
      }
    }
    
    throw lastError || new Error('Request failed after retries');
  }

  async fetchLands(): Promise<LandData[]> {
    try {
      const headers = await this.getHeaders();
      const response = await this.fetchWithRetry(LANDS_API_URL, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch lands');
      }

      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('❌ [LandsAPI] Error fetching lands:', error);
      throw error;
    }
  }

  async createLand(landData: Omit<LandData, 'id'>): Promise<LandData> {
    try {
      // Validate required fields before sending
      if (!landData.name?.trim()) {
        throw new Error('Land name is required');
      }
      if (!landData.area_acres || landData.area_acres <= 0) {
        throw new Error('Valid area is required');
      }

      const headers = await this.getHeaders();
      
      console.log('🌐 [LandsAPI] Creating land:', {
        name: landData.name,
        area_acres: landData.area_acres,
        hasBoundary: !!landData.boundary_polygon_old
      });

      const response = await this.fetchWithRetry(LANDS_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(landData),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ [LandsAPI] Create failed:', error);
        throw new Error(error.error || error.details || 'Failed to create land');
      }

      const result = await response.json();
      console.log('✅ [LandsAPI] Land created:', result.data?.id);
      return result.data;
    } catch (error) {
      console.error('❌ [LandsAPI] Error creating land:', error);
      throw error;
    }
  }

  async updateLand(id: string, landData: Partial<LandData>): Promise<LandData> {
    try {
      const headers = await this.getHeaders();
      const response = await this.fetchWithRetry(`${LANDS_API_URL}/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(landData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update land');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('❌ [LandsAPI] Error updating land:', error);
      throw error;
    }
  }

  async deleteLand(id: string): Promise<void> {
    try {
      const headers = await this.getHeaders();
      const response = await this.fetchWithRetry(`${LANDS_API_URL}/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete land');
      }
    } catch (error) {
      console.error('❌ [LandsAPI] Error deleting land:', error);
      throw error;
    }
  }

  async fetchLandById(id: string): Promise<LandData | null> {
    try {
      const headers = await this.getHeaders();
      
      console.log('🌐 [LandsAPI] Fetching land by ID:', id);
      
      const response = await this.fetchWithRetry(`${LANDS_API_URL}/${id}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log('⚠️ [LandsAPI] Land not found:', id);
          return null;
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch land');
      }

      const result = await response.json();
      console.log('✅ [LandsAPI] Land fetched:', result.data?.name);
      return result.data || null;
    } catch (error) {
      console.error('❌ [LandsAPI] Error fetching land by ID:', error);
      return null;
    }
  }
}

export const landsApi = new LandsApiService();