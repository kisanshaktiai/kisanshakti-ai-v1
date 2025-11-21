/**
 * Tenant Isolation Service
 * 
 * CRITICAL SECURITY SERVICE for Multi-Tenant SaaS
 * 
 * This service ensures complete data isolation between tenants by:
 * 1. Validating tenant context on every operation
 * 2. Enforcing tenant_id filters on all data access
 * 3. Preventing cross-tenant data leakage
 * 4. Maintaining tenant context in localStorage and memory
 */

export interface TenantContext {
  tenantId: string;
  domain: string;
  userId?: string;
  timestamp: number;
}

class TenantIsolationService {
  private static instance: TenantIsolationService;
  private currentTenantContext: TenantContext | null = null;

  private constructor() {
    this.loadTenantContextFromStorage();
  }

  static getInstance(): TenantIsolationService {
    if (!TenantIsolationService.instance) {
      TenantIsolationService.instance = new TenantIsolationService();
    }
    return TenantIsolationService.instance;
  }

  /**
   * Load tenant context from localStorage on app start
   */
  private loadTenantContextFromStorage(): void {
    try {
      const tenantId = localStorage.getItem('tenantId');
      const domain = localStorage.getItem('tenantDomain');
      
      if (tenantId && domain) {
        this.currentTenantContext = {
          tenantId,
          domain,
          timestamp: Date.now()
        };
        console.log('🔐 [TenantIsolation] Loaded tenant context:', {
          tenantId,
          domain
        });
      }
    } catch (error) {
      console.error('Failed to load tenant context:', error);
    }
  }

  /**
   * Set the current tenant context (called after tenant is loaded)
   */
  setTenantContext(tenantId: string, domain: string, userId?: string): void {
    this.currentTenantContext = {
      tenantId,
      domain,
      userId,
      timestamp: Date.now()
    };

    // Persist to localStorage for recovery after page reload
    localStorage.setItem('tenantId', tenantId);
    localStorage.setItem('tenantDomain', domain);

    console.log('✅ [TenantIsolation] Tenant context set:', {
      tenantId,
      domain,
      userId
    });
  }

  /**
   * Update user in tenant context (called after authentication)
   */
  setUserId(userId: string): void {
    if (this.currentTenantContext) {
      this.currentTenantContext.userId = userId;
      console.log('✅ [TenantIsolation] User ID added to tenant context:', userId);
    } else {
      console.warn('⚠️ [TenantIsolation] Cannot set userId - tenant context not initialized');
    }
  }

  /**
   * Get current tenant context
   * @throws Error if tenant context is not set
   */
  getTenantContext(): TenantContext {
    if (!this.currentTenantContext) {
      throw new Error('Tenant context not initialized - app must load tenant first');
    }
    return this.currentTenantContext;
  }

  /**
   * Get tenant ID safely (returns null if not set)
   */
  getTenantId(): string | null {
    return this.currentTenantContext?.tenantId || null;
  }

  /**
   * Get user ID safely (returns null if not set)
   */
  getUserId(): string | null {
    return this.currentTenantContext?.userId || null;
  }

  /**
   * Validate that we have complete tenant and user context for data operations
   * @param requireUser - if true, also requires userId to be set
   */
  validateContext(requireUser: boolean = false): {
    valid: boolean;
    tenantId?: string;
    userId?: string;
    error?: string;
  } {
    if (!this.currentTenantContext) {
      return {
        valid: false,
        error: 'Tenant context not initialized'
      };
    }

    if (requireUser && !this.currentTenantContext.userId) {
      return {
        valid: false,
        tenantId: this.currentTenantContext.tenantId,
        error: 'User not authenticated'
      };
    }

    return {
      valid: true,
      tenantId: this.currentTenantContext.tenantId,
      userId: this.currentTenantContext.userId
    };
  }

  /**
   * Create a tenant-scoped filter for Supabase queries
   * This ensures all queries are automatically filtered by tenant_id
   */
  getTenantFilter(): { tenant_id: string } {
    const context = this.getTenantContext();
    return { tenant_id: context.tenantId };
  }

  /**
   * Verify that data belongs to current tenant
   * @param data - Object with tenant_id field
   * @returns true if data belongs to current tenant, false otherwise
   */
  verifyTenantOwnership(data: { tenant_id?: string }): boolean {
    if (!this.currentTenantContext) {
      console.error('❌ [TenantIsolation] Cannot verify ownership - context not initialized');
      return false;
    }

    if (!data.tenant_id) {
      console.error('❌ [TenantIsolation] Data missing tenant_id field');
      return false;
    }

    const isValid = data.tenant_id === this.currentTenantContext.tenantId;
    
    if (!isValid) {
      console.error('❌ [TenantIsolation] SECURITY VIOLATION: Data belongs to different tenant!', {
        dataTenantId: data.tenant_id,
        currentTenantId: this.currentTenantContext.tenantId
      });
    }

    return isValid;
  }

  /**
   * Clear tenant context (on logout or tenant switch)
   */
  clearContext(): void {
    this.currentTenantContext = null;
    localStorage.removeItem('tenantId');
    localStorage.removeItem('tenantDomain');
    console.log('🔓 [TenantIsolation] Tenant context cleared');
  }

  /**
   * Get tenant-specific database name for IndexedDB
   */
  getTenantDatabaseName(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new Error('Cannot generate database name - tenant not loaded');
    }
    return `KisanDB_${tenantId}`;
  }
}

// Export singleton instance
export const tenantIsolationService = TenantIsolationService.getInstance();
