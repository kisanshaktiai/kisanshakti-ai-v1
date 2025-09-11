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
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const BACKGROUND_REFRESH_THRESHOLD = 60 * 60 * 1000; // 1 hour

export class WhiteLabelService {
  private static instance: WhiteLabelService;
  private currentRequest: Promise<WhiteLabelConfig | null> | null = null;

  private constructor() {}

  static getInstance(): WhiteLabelService {
    if (!WhiteLabelService.instance) {
      WhiteLabelService.instance = new WhiteLabelService();
    }
    return WhiteLabelService.instance;
  }

  /**
   * Get white label config with caching and offline support
   */
  async getConfig(tenantId?: string, domain?: string): Promise<WhiteLabelConfig | null> {
    // Check cache first
    const cached = this.getCachedConfig();
    
    // If cache is valid and fresh, return it
    if (cached && cached.expiresAt > Date.now()) {
      const age = Date.now() - (cached.expiresAt - CACHE_DURATION);
      
      // If cache is older than 1 hour, refresh in background
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
          return responseData;
        }

        if (data) {
          // Cache the successful response
          this.cacheConfig(data);
          console.log('White-label config fetched and cached successfully');
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
    this.clearCache();
    return this.fetchConfig(tenantId, domain);
  }
}