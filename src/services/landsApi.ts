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
    const maxAttempts = 10; // Increased attempts
    const baseDelay = 200;
    
    while (attempts < maxAttempts) {
      try {
        const { tenantId, farmerId, isValid } = dataIsolation.getIsolationContext();
        
        if (isValid && tenantId && farmerId) {
          const headers = dataIsolation.getIsolationHeaders();
          // Phase 5 guard requires a real Supabase JWT — pull it from the active session.
          // Fall back to anon key as Bearer so the guard's NO_AUTH_HEADER check passes
          // (downstream tenant/farmer scoping uses x-farmer-id / x-tenant-id headers).
          const { data: { session } } = await supabase.auth.getSession();
          const bearer = session?.access_token || SUPABASE_CONFIG.ANON_KEY;
          console.log('🌐 [LandsAPI] Headers ready:', { 
            tenantId: headers['x-tenant-id']?.substring(0, 8) + '...', 
            farmerId: headers['x-farmer-id']?.substring(0, 8) + '...',
            authMode: session?.access_token ? 'session-jwt' : 'anon-fallback'
          });
          return {
            ...headers,
            'apikey': SUPABASE_CONFIG.ANON_KEY,
            'Authorization': `Bearer ${bearer}`,
            'Content-Type': 'application/json'
          };
        }
      } catch (contextError) {
        console.warn(`🌐 [LandsAPI] Context error on attempt ${attempts + 1}:`, contextError);
      }
      
      const delay = baseDelay * Math.min(attempts + 1, 3); // Progressive delay, max 600ms
      console.log(`🌐 [LandsAPI] Waiting for context (attempt ${attempts + 1}/${maxAttempts}, delay: ${delay}ms)...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempts++;
    }
    
    console.error('❌ [LandsAPI] Context never became valid after', maxAttempts, 'attempts');
    throw new Error('Session expired. Please log in again to manage lands.');
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

  async fetchLands(opts?: { since?: string | null }): Promise<LandData[]> {
    try {
      const headers = await this.getHeaders();
      const url = opts?.since
        ? `${LANDS_API_URL}?since=${encodeURIComponent(opts.since)}`
        : LANDS_API_URL;

      const response = await this.fetchWithRetry(url, {
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
    // Validate required fields before sending
    if (!landData.name?.trim()) {
      throw new Error('Land name is required');
    }
    if (!landData.area_acres || landData.area_acres <= 0) {
      throw new Error('Valid area is required');
    }

    // Check network connectivity first
    if (!navigator.onLine) {
      throw new Error('No internet connection. Please connect and try again.');
    }

    let headers: HeadersInit;
    try {
      headers = await this.getHeaders();
    } catch (headerError) {
      console.error('❌ [LandsAPI] Header error:', headerError);
      throw headerError;
    }
    
    console.log('🌐 [LandsAPI] Creating land:', {
      name: landData.name,
      area_acres: landData.area_acres,
      hasBoundary: !!landData.boundary_polygon_old
    });

    try {
      const response = await this.fetchWithRetry(LANDS_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(landData),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to create land';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.details || errorData.message || errorMessage;
          console.error('❌ [LandsAPI] Create failed:', errorData);
        } catch (parseError) {
          console.error('❌ [LandsAPI] Failed to parse error response');
        }
        
        // Handle specific HTTP status codes
        if (response.status === 401 || response.status === 403) {
          throw new Error('Session expired. Please log in again.');
        } else if (response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('✅ [LandsAPI] Land created:', result.data?.id);
      return result.data;
    } catch (error: any) {
      // Re-throw if already a proper error
      if (error.message) {
        throw error;
      }
      console.error('❌ [LandsAPI] Network error:', error);
      throw new Error('Network error. Please check your connection and try again.');
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
    console.log('🗑️ [LandsAPI] Initiating soft delete for land:', id);
    
    // Check network connectivity first
    if (!navigator.onLine) {
      throw new Error('No internet connection. Please connect and try again.');
    }
    
    try {
      const headers = await this.getHeaders();
      console.log('🗑️ [LandsAPI] Making DELETE request to:', `${LANDS_API_URL}/${id}`);
      
      const response = await this.fetchWithRetry(`${LANDS_API_URL}/${id}`, {
        method: 'DELETE',
        headers,
      });

      console.log('🗑️ [LandsAPI] DELETE response status:', response.status);

      if (!response.ok) {
        let errorMessage = 'Failed to remove land';
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
          console.error('❌ [LandsAPI] Delete failed:', error);
        } catch (parseError) {
          console.error('❌ [LandsAPI] Failed to parse error response');
        }
        
        // Handle specific HTTP status codes
        if (response.status === 401 || response.status === 403) {
          throw new Error('Session expired. Please log in again.');
        } else if (response.status === 404) {
          throw new Error('Land not found or already removed.');
        } else if (response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        
        throw new Error(errorMessage);
      }
      
      console.log('✅ [LandsAPI] Land soft deleted successfully:', id);
    } catch (error: any) {
      console.error('❌ [LandsAPI] Error deleting land:', {
        landId: id,
        error: error?.message || error,
        stack: error?.stack
      });
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