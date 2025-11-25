import { supabase } from '@/utils/supabase';
import { useAuthStore } from '@/stores/authStore';
import { dataIsolation, isolatedSupabase } from './dataIsolationService';

const LANDS_API_URL = 'https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/lands-api';

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
  private getHeaders(): HeadersInit {
    // Use centralized data isolation service for headers
    const headers = dataIsolation.getIsolationHeaders();
    
    return {
      ...headers,
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFma2xra3p4ZW1zYmVuaXl1Z2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MjcxNjUsImV4cCI6MjA2ODAwMzE2NX0.dUnGp7wbwYom1FPbn_4EGf3PWjgmr8mXwL2w2SdYOh4'
    };
  }

  async fetchLands(): Promise<LandData[]> {
    try {
      const response = await fetch(LANDS_API_URL, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch lands');
      }

      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Error fetching lands:', error);
      throw error;
    }
  }

  async createLand(landData: Omit<LandData, 'id'>): Promise<LandData> {
    try {
      const response = await fetch(LANDS_API_URL, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(landData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create land');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error creating land:', error);
      throw error;
    }
  }

  async updateLand(id: string, landData: Partial<LandData>): Promise<LandData> {
    try {
      const response = await fetch(`${LANDS_API_URL}/${id}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(landData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update land');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error updating land:', error);
      throw error;
    }
  }

  async deleteLand(id: string): Promise<void> {
    try {
      const response = await fetch(`${LANDS_API_URL}/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete land');
      }
    } catch (error) {
      console.error('Error deleting land:', error);
      throw error;
    }
  }

  // Fetch a specific land by ID - uses the Edge Function
  async fetchLandById(id: string): Promise<LandData | null> {
    try {
      const headers = this.getHeaders();
      
      console.log('🌐 [LandsAPI] Fetching land by ID:', {
        landId: id,
        headers: {
          'x-tenant-id': headers['x-tenant-id'],
          'x-farmer-id': headers['x-farmer-id'],
          'x-session-token': headers['x-session-token'] ? '***' : 'null'
        }
      });
      
      const response = await fetch(`${LANDS_API_URL}/${id}`, {
        method: 'GET',
        headers,
      });

      console.log('🌐 [LandsAPI] Response status:', response.status);

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ [LandsAPI] Error fetching land by ID:', {
          status: response.status,
          error,
          landId: id
        });
        
        // Return null for 404 errors (land not found)
        if (response.status === 404) {
          console.log('⚠️ [LandsAPI] Land not found with ID:', id);
          return null;
        }
        
        throw new Error(error.error || 'Failed to fetch land');
      }

      const result = await response.json();
      console.log('✅ [LandsAPI] Land fetched successfully:', {
        landId: result.data?.id,
        landName: result.data?.name
      });
      
      return result.data || null;
    } catch (error) {
      console.error('❌ [LandsAPI] Exception fetching land by ID:', error);
      return null;
    }
  }
}

export const landsApi = new LandsApiService();