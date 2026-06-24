import { dataIsolation } from './dataIsolationService';
import { SUPABASE_CONFIG, getSupabaseFunctionUrl } from '@/config/supabase';

const SCHEDULES_API_URL = getSupabaseFunctionUrl('schedules-api');
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

export interface ScheduleData {
  id: string;
  farmer_id: string;
  land_id: string;
  tenant_id: string;
  crop_name: string;
  crop_variety?: string;
  sowing_date: string;
  expected_harvest_date?: string;
  status: string;
  is_active: boolean;
  ai_generated?: boolean;
  generation_params?: any;
  schedule_summary?: any;
  weather_adjustments?: any;
  created_at: string;
  updated_at: string;
}

class SchedulesApiService {
  private async getHeaders(): Promise<HeadersInit> {
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const { tenantId, farmerId, isValid } = dataIsolation.getIsolationContext();
      
      if (isValid && tenantId && farmerId) {
        const headers = dataIsolation.getIsolationHeaders();
        console.log('🌐 [SchedulesAPI] Headers ready:', { 
          tenantId: headers['x-tenant-id'], 
          farmerId: headers['x-farmer-id'] 
        });
        return {
          ...headers,
          apikey: SUPABASE_CONFIG.ANON_KEY,
          Authorization: `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
        };
      }
      
      console.log(`🌐 [SchedulesAPI] Waiting for context (attempt ${attempts + 1}/${maxAttempts})...`);
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }
    
    console.error('❌ [SchedulesAPI] Context never became valid after waiting');
    throw new Error('Please ensure you are logged in before accessing schedules');
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
        console.warn(`🌐 [SchedulesAPI] Fetch failed (attempt ${i + 1}/${retries + 1}):`, error);
        
        if (i < retries) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
        }
      }
    }
    
    throw lastError || new Error('Request failed after retries');
  }

  async fetchSchedules(landId?: string, opts?: { since?: string | null; limit?: number }): Promise<ScheduleData[]> {
    try {
      const headers = await this.getHeaders();
      const params = new URLSearchParams();
      if (landId) params.set('land_id', landId);
      if (opts?.since) params.set('since', opts.since);
      if (opts?.limit) params.set('limit', String(opts.limit));
      const qs = params.toString();
      const url = qs ? `${SCHEDULES_API_URL}?${qs}` : SCHEDULES_API_URL;
      
      const response = await this.fetchWithRetry(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch schedules');
      }

      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('❌ [SchedulesAPI] Error fetching schedules:', error);
      throw error;
    }
  }

  async fetchScheduleById(id: string): Promise<ScheduleData | null> {
    try {
      const headers = await this.getHeaders();
      
      const response = await this.fetchWithRetry(`${SCHEDULES_API_URL}/${id}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch schedule');
      }

      const result = await response.json();
      return result.data || null;
    } catch (error) {
      console.error('❌ [SchedulesAPI] Error fetching schedule:', error);
      return null;
    }
  }

  async deleteSchedule(id: string): Promise<void> {
    try {
      const headers = await this.getHeaders();
      const response = await this.fetchWithRetry(`${SCHEDULES_API_URL}/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete schedule');
      }
    } catch (error) {
      console.error('❌ [SchedulesAPI] Error deleting schedule:', error);
      throw error;
    }
  }

  async fetchTasks(
    scheduleId?: string,
    opts?: { since?: string | null; limit?: number; cursor?: string | null }
  ): Promise<any[]> {
    try {
      const headers = await this.getHeaders();
      const params = new URLSearchParams();
      if (scheduleId) params.set('schedule_id', scheduleId);
      if (opts?.since) params.set('since', opts.since);
      if (opts?.limit) params.set('limit', String(opts.limit));
      if (opts?.cursor) params.set('cursor', opts.cursor);
      const qs = params.toString();
      const url = qs
        ? `${SCHEDULES_API_URL}/tasks?${qs}`
        : `${SCHEDULES_API_URL}/tasks`;
      
      const response = await this.fetchWithRetry(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch tasks');
      }

      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('❌ [SchedulesAPI] Error fetching tasks:', error);
      throw error;
    }
  }
  // ──────────────────────────────────────────────────────────────
  // Harvest confirmation (Step 3)
  // ──────────────────────────────────────────────────────────────
  async fetchPendingHarvests(): Promise<any[]> {
    try {
      const headers = await this.getHeaders();
      const url = `${SCHEDULES_API_URL}?action=harvest-pending`;
      const res = await this.fetchWithRetry(url, { method: 'POST', headers, body: '{}' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch pending harvests');
      }
      const json = await res.json();
      return json.data || [];
    } catch (e) {
      console.error('❌ [SchedulesAPI] fetchPendingHarvests:', e);
      return [];
    }
  }

  async confirmHarvest(payload: {
    schedule_id: string;
    outcome: 'FULLY_HARVESTED' | 'PARTIALLY_HARVESTED' | 'ABANDONED';
    actual_harvest_date?: string;
    yield_qtl?: number | null;
    notes?: string | null;
  }): Promise<{ ok: boolean; schedule_id: string; outcome: string }> {
    const headers = await this.getHeaders();
    const url = `${SCHEDULES_API_URL}?action=harvest-confirm`;
    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to confirm harvest');
    }
    return res.json();
  }

  async snoozeHarvest(requestId: string, days = 7): Promise<{ ok: boolean; due_at: string }> {
    const headers = await this.getHeaders();
    const url = `${SCHEDULES_API_URL}?action=harvest-snooze`;
    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, days }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to snooze harvest');
    }
    return res.json();
  }
}

export const schedulesApi = new SchedulesApiService();
