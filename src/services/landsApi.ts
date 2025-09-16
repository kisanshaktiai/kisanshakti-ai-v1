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
      const response = await fetch(`${LANDS_API_URL}/lands`, {
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
      const response = await fetch(`${LANDS_API_URL}/lands`, {
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
      const response = await fetch(`${LANDS_API_URL}/lands/${id}`, {
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
      const response = await fetch(`${LANDS_API_URL}/lands/${id}`, {
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

  // Fetch a specific land by ID - uses direct Supabase for complex query chaining
  async fetchLandById(id: string): Promise<LandData | null> {
    // Validate context first
    const validation = dataIsolation.validateContext();
    if (!validation.isValid) {
      console.error('Invalid data isolation context:', validation.error);
      throw new Error(validation.error || 'Invalid isolation context');
    }

    const { tenantId, farmerId } = dataIsolation.getIsolationContext();

    // Log query parameters for debugging
    console.log('Fetching land with isolated parameters:', {
      landId: id,
      tenantId,
      farmerId,
      filters: {
        is_active: true,
        deleted_at: null
      }
    });

    // Use direct Supabase client with manual isolation for complex query
    // Lands table uses tenant_id for isolation, not farmer_id
    const { data, error } = await supabase
      .from('lands')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('farmer_id', farmerId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      console.error('Error fetching land by ID:', error);
      return null;
    }

    if (!data) {
      console.log('No land found with ID:', id, 'for tenant:', tenantId, 'and farmer:', farmerId);
      return null;
    }

    return data;
  }
}

export const landsApi = new LandsApiService();