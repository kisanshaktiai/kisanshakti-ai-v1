import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { tenantIsolationService } from './tenantIsolationService';

/**
 * Centralized service for tenant and farmer data isolation
 * Ensures all database operations are properly scoped to the current tenant and farmer
 */
class DataIsolationService {
  /**
   * Get current isolation context from auth store and tenant isolation service
   */
  getIsolationContext() {
    const { user, session } = useAuthStore.getState();
    
    // Get tenant ID from user object first, fallback to tenant isolation service
    let tenantId = user?.tenantId;
    if (!tenantId) {
      try {
        tenantId = tenantIsolationService.getTenantId();
      } catch (e) {
        // Tenant isolation service not initialized yet
        console.warn('[DataIsolation] Tenant isolation service not initialized');
      }
    }
    
    // CRITICAL: farmerId should come from user.id (which is the farmer's ID)
    // The session.farmerId should match user.id
    const farmerId = user?.id || session?.farmerId || null;
    
    console.log('🔍 [DataIsolation] Getting isolation context:', {
      tenantId,
      farmerId,
      userId: user?.id,
      sessionFarmerId: session?.farmerId,
      hasSession: !!session,
      hasUser: !!user
    });
    
    return {
      tenantId: tenantId || null,
      farmerId: farmerId,
      sessionToken: session?.token || null,
      isValid: !!(tenantId && farmerId)
    };
  }

  /**
   * Apply tenant and farmer isolation to Supabase queries
   */
  applyIsolation(query: any, options?: { skipFarmer?: boolean }): any {
    const { tenantId, farmerId } = this.getIsolationContext();
    
    if (!tenantId) {
      console.warn('No tenant ID found in isolation context');
      return query;
    }

    let isolatedQuery = query.eq('tenant_id', tenantId);
    
    if (!options?.skipFarmer && farmerId) {
      isolatedQuery = isolatedQuery.eq('farmer_id', farmerId);
    }
    
    return isolatedQuery;
  }

  /**
   * Get isolation headers for edge functions and API calls
   */
  getIsolationHeaders(): HeadersInit {
    const { tenantId, farmerId, sessionToken } = this.getIsolationContext();
    
    return {
      'x-tenant-id': tenantId || '',
      'x-farmer-id': farmerId || '',
      'x-session-token': sessionToken || '',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Enrich data with tenant and farmer IDs before insertion
   */
  enrichDataForInsert<T extends Record<string, any>>(data: T | T[]): T | T[] {
    const { tenantId, farmerId } = this.getIsolationContext();
    
    if (!tenantId || !farmerId) {
      console.warn('Missing tenant or farmer ID for data enrichment');
    }

    if (Array.isArray(data)) {
      return data.map(item => ({
        ...item,
        tenant_id: tenantId,
        farmer_id: farmerId
      })) as T[];
    }
    
    return {
      ...data,
      tenant_id: tenantId,
      farmer_id: farmerId
    } as T;
  }

  /**
   * Validate if current context has required isolation data
   */
  validateContext(): { isValid: boolean; error?: string } {
    const { tenantId, farmerId, isValid } = this.getIsolationContext();
    
    if (!isValid) {
      if (!tenantId) {
        return { isValid: false, error: 'No tenant context available' };
      }
      if (!farmerId) {
        return { isValid: false, error: 'No farmer context available' };
      }
    }
    
    return { isValid: true };
  }
}

// Export singleton instance
export const dataIsolation = new DataIsolationService();

/**
 * Wrapper for isolated Supabase queries
 * Automatically applies tenant and farmer isolation
 */
export const isolatedSupabase = {
  from: <T extends keyof Database['public']['Tables']>(table: T) => {
    const baseQuery = supabase.from(table);
    const { tenantId, farmerId } = dataIsolation.getIsolationContext();
    
    return {
      select: (columns?: string, options?: { skipFarmer?: boolean }) => {
        const query = baseQuery.select(columns || '*');
        return dataIsolation.applyIsolation(query, options);
      },
      
      insert: (data: any) => {
        const enrichedData = dataIsolation.enrichDataForInsert(data);
        return baseQuery.insert(enrichedData);
      },
      
      update: (data: any) => {
        const query = baseQuery.update(data);
        return dataIsolation.applyIsolation(query);
      },
      
      delete: () => {
        const query = baseQuery.delete();
        return dataIsolation.applyIsolation(query);
      },
      
      upsert: (data: any) => {
        const enrichedData = dataIsolation.enrichDataForInsert(data);
        return baseQuery.upsert(enrichedData);
      }
    };
  }
};

/**
 * Hook for using data isolation in React components
 */
export const useDataIsolation = () => {
  const context = dataIsolation.getIsolationContext();
  const validation = dataIsolation.validateContext();
  
  return {
    ...context,
    ...validation,
    applyIsolation: dataIsolation.applyIsolation.bind(dataIsolation),
    getHeaders: dataIsolation.getIsolationHeaders.bind(dataIsolation),
    enrichData: dataIsolation.enrichDataForInsert.bind(dataIsolation)
  };
};