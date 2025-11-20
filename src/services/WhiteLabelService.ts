import { supabase } from '@/integrations/supabase/client';

interface WhiteLabelConfig {
  tenant: {
    id: string;
    name: string;
    slug: string;
    subdomain?: string;
    custom_domain?: string;
    is_default?: boolean;
    settings?: any;
    status?: string;
  };
  whiteLabelConfig: {
    brand_identity?: any;
    app_customization?: any;
    pwa_config?: any;
    theme_colors?: any;
    email_templates?: any;
  } | null;
  features?: string[];
  languages?: string[];
  timestamp: string;
}

interface CachedConfig {
  data: WhiteLabelConfig;
  expiresAt: number;
  etag?: string;
}

const CACHE_KEY = 'white_label_config';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes - fast updates for production
const CHECK_INTERVAL = 2 * 60 * 1000; // Check every 2 minutes
const BACKGROUND_REFRESH_THRESHOLD = 1 * 60 * 1000; // 1 minute - refresh sooner

export class WhiteLabelService {
  private static instance: WhiteLabelService;
  private currentRequest: Promise<WhiteLabelConfig | null> | null = null;
  private autoRefreshTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.setupAutoRefresh();
  }

  static getInstance(): WhiteLabelService {
    if (!WhiteLabelService.instance) {
      WhiteLabelService.instance = new WhiteLabelService();
    }
    return WhiteLabelService.instance;
  }

  private setupAutoRefresh(): void {
    // Clear any existing timer
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
    }

    // Set up automatic refresh every 2 minutes for production readiness
    this.autoRefreshTimer = setInterval(() => {
      console.log('[WhiteLabelService] Auto-refreshing theme (every 2 mins)');
      this.forceRefresh();
    }, CHECK_INTERVAL);

    // Also check on page visibility change
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          const cached = this.getCachedConfig();
          if (cached) {
            const age = Date.now() - (cached.expiresAt - CACHE_DURATION);
            
            // If cache is older than 2 minutes, refresh
            if (age > CHECK_INTERVAL) {
              console.log('[WhiteLabelService] Cache expired (>2 mins), refreshing on visibility change');
              this.forceRefresh();
            }
          }
        }
      });
    }
  }

  /**
   * Get white label config with caching and offline support
   */
  async getConfig(tenantId?: string, domain?: string): Promise<WhiteLabelConfig | null> {
    const currentDomain = window.location.hostname;
    
    // Validate cached config matches current domain
    const cached = this.getCachedConfig();
    if (cached?.data?.tenant) {
      const cachedDomains = [
        cached.data.tenant.custom_domain,
        cached.data.tenant.subdomain,
        (cached.data.whiteLabelConfig as any)?.domain_config?.custom_domain,
        (cached.data.whiteLabelConfig as any)?.brand_identity?.domain_config?.custom_domain
      ].filter(Boolean);
      
      const domainMatches = cachedDomains.some(d => d === currentDomain);
      
      if (!domainMatches) {
        console.log('🔄 [WhiteLabelService] Domain mismatch, clearing cache:', {
          cached: cachedDomains,
          current: currentDomain
        });
        this.clearCache();
        // Force fresh fetch
        return this.fetchConfig(tenantId, domain);
      }
    }
    
    // If cache is valid and fresh, return it
    if (cached && cached.expiresAt > Date.now()) {
      const age = Date.now() - (cached.expiresAt - CACHE_DURATION);
      
      // If cache is older than 1 minute, refresh in background for instant updates
      if (age > BACKGROUND_REFRESH_THRESHOLD) {
        this.refreshInBackground(tenantId, domain);
      }
      
      return cached.data;
    }

    // If offline and have cached data, use it
    if (!navigator.onLine && cached) {
      console.log('Offline - using cached white-label config');
      return cached.data;
    }

    // Prevent duplicate requests
    if (this.currentRequest) {
      return this.currentRequest;
    }

    // Fetch fresh config
    this.currentRequest = this.fetchConfig(tenantId, domain);
    
    try {
      const config = await this.currentRequest;
      return config;
    } finally {
      this.currentRequest = null;
    }
  }

  /**
   * Fetch config from edge function
   */
  private async fetchConfig(tenantId?: string, domain?: string): Promise<WhiteLabelConfig | null> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Fetching white-label config (attempt ${attempt}/${maxRetries})`);
        
        const params = new URLSearchParams();
        if (tenantId) params.append('tenant_id', tenantId);
        if (domain) params.append('domain', domain);
        
        const { data, error } = await supabase.functions.invoke('get-white-label-config', {
          method: 'GET',
          // Pass params as query string since it's a GET request
          ...(params.toString() && { 
            headers: {
              'x-query-params': params.toString()
            }
          })
        });

        // Alternative approach - direct URL call if invoke doesn't work with GET params
        if (error) {
          const url = `https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/get-white-label-config?${params.toString()}`;
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const responseData = await response.json();
          
          // Cache the successful response
          this.cacheConfig(responseData);
          console.log('White-label config fetched and cached successfully');
          
          // Notify about theme update
          this.notifyThemeUpdate(responseData);
          return responseData;
        }

        if (data) {
          // Cache the successful response
          this.cacheConfig(data);
          console.log('White-label config fetched and cached successfully');
          
          // Notify about theme update
          this.notifyThemeUpdate(data);
          return data;
        }
      } catch (error) {
        lastError = error as Error;
        console.error(`Failed to fetch white-label config (attempt ${attempt}):`, error);
        
        // Exponential backoff
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    // If all retries failed, try to use cached data
    const cached = this.getCachedConfig();
    if (cached) {
      console.log('Using cached white-label config after fetch failure');
      return cached.data;
    }

    console.error('Failed to fetch white-label config after all retries:', lastError);
    return null;
  }

  /**
   * Refresh config in background
   */
  private async refreshInBackground(tenantId?: string, domain?: string): Promise<void> {
    // Don't await - let it run in background
    this.fetchConfig(tenantId, domain).catch(error => {
      console.error('Background refresh failed:', error);
    });
  }

  /**
   * Notify about theme update
   */
  private notifyThemeUpdate(config: WhiteLabelConfig): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('themeUpdated', { detail: config }));
    }
  }

  /**
   * Get cached config from localStorage
   */
  private getCachedConfig(): CachedConfig | null {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Failed to parse cached config:', error);
      localStorage.removeItem(CACHE_KEY);
    }
    return null;
  }

  /**
   * Cache config in localStorage
   */
  private cacheConfig(config: WhiteLabelConfig): void {
    try {
      const cached: CachedConfig = {
        data: config,
        expiresAt: Date.now() + CACHE_DURATION,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch (error) {
      console.error('Failed to cache config:', error);
    }
  }

  /**
   * Clear cached config
   */
  clearCache(): void {
    localStorage.removeItem(CACHE_KEY);
    console.log('White-label config cache cleared');
  }

  /**
   * Force refresh config
   */
  async forceRefresh(tenantId?: string, domain?: string): Promise<WhiteLabelConfig | null> {
    console.log('[WhiteLabelService] Force refreshing configuration');
    this.clearCache();
    const config = await this.fetchConfig(tenantId, domain);
    
    // If we got a new config, notify about the update
    if (config) {
      this.notifyThemeUpdate(config);
    }
    
    return config;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }
}