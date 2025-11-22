import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { localDB } from '@/services/localDB';
import { tenantIsolationService } from '@/services/tenantIsolationService';
import { resetTenantStores } from '@/utils/resetStores';
import { getEnvironment, logEnvironmentInfo } from '@/utils/environment';

// ============= Types =============

export interface BrandingConfig {
  company_name?: string;
  tagline?: string;
  logo_url?: string;
  favicon_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  background_color?: string;
  text_color?: string;
  font_family?: string;
  description?: string;
}

export interface ThemeConfig {
  core?: Record<string, string>;
  neutral?: Record<string, string>;
  status?: Record<string, string>;
  typography?: { font_family?: string };
  navigation?: Record<string, string>;
  charts?: Record<string, string>;
  maps?: Record<string, string>;
  weather?: Record<string, string>;
  gradients?: Record<string, string>;
  dark_mode?: {
    enabled: boolean;
    colors?: Record<string, string>;
  };
}

export interface PWAConfig {
  name?: string;
  short_name?: string;
  icons?: Array<{ src: string; sizes?: string; type?: string }>;
  theme_color?: string;
  background_color?: string;
}

export interface TenantConfig {
  id: string;
  name: string;
  slug?: string;
  domain: string;
  subdomain?: string;
  custom_domain?: string;
  status?: string;
  branding: BrandingConfig;
  theme?: ThemeConfig;
  pwa?: PWAConfig;
  features: string[];
  settings: {
    languages: string[];
    defaultLanguage: string;
    timezone?: string;
    currency?: string;
  };
}

export interface TenantContextValue {
  tenant: TenantConfig | null;
  branding: BrandingConfig | null;
  theme: ThemeConfig | null;
  features: string[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  clearCache: () => void;
  lastUpdated: Date | null;
}

// ============= Context =============

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

// ============= Provider =============

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentDomain, setCurrentDomain] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevTenantIdRef = useRef<string | null>(null);

  const getCurrentDomain = useCallback(() => {
    if (typeof window === 'undefined') return 'localhost';
    return window.location.hostname;
  }, []);

  const applyThemeToDOM = useCallback((branding: BrandingConfig, theme?: ThemeConfig) => {
    const root = document.documentElement;

    // Helper to convert colors to HSL
    const hexToHSL = (hex: string): string => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return '';
      
      const r = parseInt(result[1], 16) / 255;
      const g = parseInt(result[2], 16) / 255;
      const b = parseInt(result[3], 16) / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0;
      const l = (max + min) / 2;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      
      return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    };

    const ensureHSL = (color: string): string => {
      if (!color) return '';
      if (color.includes('%')) return color;
      if (color.startsWith('#')) return hexToHSL(color);
      return color;
    };

    console.log('🎨 [TenantProvider] Applying theme to DOM');
    console.log('🎨 [TenantProvider] Branding data:', {
      company_name: branding.company_name,
      logo_url: branding.logo_url,
      favicon_url: branding.favicon_url,
      primary_color: branding.primary_color,
      secondary_color: branding.secondary_color,
      accent_color: branding.accent_color,
    });
    console.log('🎨 [TenantProvider] Theme data:', theme ? Object.keys(theme) : 'No theme data');

    // Apply theme colors if available
    if (theme?.core) {
      console.log('🎨 [TenantProvider] Applying core theme colors:', Object.keys(theme.core));
      Object.entries(theme.core).forEach(([key, value]) => {
        if (value) {
          const hslValue = ensureHSL(value);
          root.style.setProperty(`--${key.replace(/_/g, '-')}`, hslValue);
          console.log(`  ✓ Set --${key.replace(/_/g, '-')}: ${hslValue}`);
        }
      });
    }

    if (theme?.neutral) {
      if (theme.neutral.background) root.style.setProperty('--background', ensureHSL(theme.neutral.background));
      if (theme.neutral.surface) {
        root.style.setProperty('--card', ensureHSL(theme.neutral.surface));
        root.style.setProperty('--popover', ensureHSL(theme.neutral.surface));
      }
      if (theme.neutral.border) {
        root.style.setProperty('--border', ensureHSL(theme.neutral.border));
        root.style.setProperty('--input', ensureHSL(theme.neutral.border));
      }
    }

    if (theme?.status) {
      if (theme.status.success) root.style.setProperty('--success', ensureHSL(theme.status.success));
      if (theme.status.error) root.style.setProperty('--destructive', ensureHSL(theme.status.error));
      if (theme.status.warning) root.style.setProperty('--warning', ensureHSL(theme.status.warning));
      if (theme.status.info) root.style.setProperty('--info', ensureHSL(theme.status.info));
    }

    if (theme?.typography?.font_family) {
      root.style.setProperty('--font-sans', theme.typography.font_family);
      document.body.style.fontFamily = theme.typography.font_family;
    }

    // Fallback to branding colors
    if (branding.primary_color) {
      root.style.setProperty('--primary', ensureHSL(branding.primary_color));
      root.style.setProperty('--primary-foreground', '0 0% 100%');
    }

    if (branding.secondary_color) {
      root.style.setProperty('--secondary', ensureHSL(branding.secondary_color));
    }

    if (branding.accent_color) {
      root.style.setProperty('--accent', ensureHSL(branding.accent_color));
    }

    // Update favicon
    if (branding.favicon_url) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) link.href = branding.favicon_url;
    }

    // Update page title
    if (branding.company_name) {
      document.title = branding.company_name;
    }

    console.log('✅ [TenantProvider] Theme applied successfully');
  }, []);

  const fetchTenantConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const domain = getCurrentDomain();
      const env = getEnvironment();
      
      // Log environment info for debugging
      logEnvironmentInfo();
      
      console.log('🔍 [TenantProvider] Fetching tenant config...');
      console.log('🌐 [TenantProvider] Current domain:', domain);
      console.log('🌐 [TenantProvider] Current URL:', window.location.href);
      console.log('🔧 [TenantProvider] Environment:', env.isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION');

      // Check localStorage cache first (1 hour TTL)
      const cachedTenant = localStorage.getItem('tenant_config_cache');
      if (cachedTenant) {
        try {
          const parsed = JSON.parse(cachedTenant);
          if (Date.now() - parsed.timestamp < 3600000) { // 1 hour cache
            console.log('📦 [TenantProvider] Using cached tenant config');
            setTenant(parsed.data);
            tenantIsolationService.setTenantContext(parsed.data.id, domain);
            applyThemeToDOM(parsed.data.branding, parsed.data.theme);
            return;
          }
        } catch (e) {
          console.warn('⚠️ [TenantProvider] Failed to parse cache:', e);
          localStorage.removeItem('tenant_config_cache');
        }
      }

      // OPTION 1: Try centralized API first (cleaner)
      try {
        const response = await fetch(
          'https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/tenant-config',
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Client-Domain': domain, // Pass actual client domain
              'Origin': `https://${domain}`, // Helps with CORS and domain detection
            },
          }
        );

        if (response.ok) {
          const apiConfig = await response.json();
          
          console.log('✅ [TenantProvider] Loaded config from centralized API');
          console.log('📦 [TenantProvider] API Response:', {
            tenant_name: apiConfig.tenant?.name,
            tenant_id: apiConfig.tenant?.id,
            has_branding: !!apiConfig.branding,
            has_theme: !!apiConfig.theme,
            branding_company: apiConfig.branding?.company_name,
            branding_logo: apiConfig.branding?.logo_url,
            branding_primary_color: apiConfig.branding?.primary_color,
          });
          
          const config: TenantConfig = {
            id: apiConfig.tenant.id,
            name: apiConfig.tenant.name,
            slug: apiConfig.tenant.slug,
            domain: apiConfig.tenant.domain,
            subdomain: apiConfig.tenant.subdomain,
            custom_domain: apiConfig.tenant.custom_domain,
            status: apiConfig.tenant.status,
            branding: apiConfig.branding,
            theme: apiConfig.theme,
            pwa: apiConfig.pwa,
            features: apiConfig.features,
            settings: apiConfig.settings,
          };

          setTenant(config);
          console.log('✅ [TenantProvider] Tenant state updated:', config.name);
          console.log('✅ [TenantProvider] Setting tenant context for isolation service');
          tenantIsolationService.setTenantContext(config.id, domain);
          console.log('✅ [TenantProvider] Applying theme to DOM with branding and theme');
          applyThemeToDOM(config.branding, config.theme);
          setLastUpdated(new Date());

          // Cache for offline in IndexedDB
          await localDB.saveTenantConfig(config.id, { 
            brand_identity: apiConfig.branding,
            mobile_theme: apiConfig.theme,
            pwa_config: apiConfig.pwa
          }, {
            id: config.id,
            name: config.name,
            domain
          });

          // Cache in localStorage for fast access
          localStorage.setItem('tenant_config_cache', JSON.stringify({
            data: config,
            timestamp: Date.now()
          }));

          console.log('✅ [TenantProvider] Config cached for offline use');
          return;
        }
      } catch (apiError) {
        console.error('❌ [TenantProvider] API failed, falling back to direct DB access');
        console.error('❌ [TenantProvider] API Error details:', apiError);
        console.error('❌ [TenantProvider] API Error message:', (apiError as Error)?.message);
      }

      // OPTION 2: Fallback to direct database access (for development/testing)
      // Development mode: Use environment variable, stored tenant, or default
      if (env.isDevelopment) {
        console.log('🔧 [TenantProvider] Development mode - using fallback resolution');
        
        // Priority 1: Environment variable (VITE_DEFAULT_TENANT_ID)
        const envTenantId = env.defaultTenantId;
        
        // Priority 2: Stored tenant ID from localStorage
        const storedTenantId = localStorage.getItem('tenantId');
        
        const targetTenantId = envTenantId || storedTenantId;
        
        console.log('🔍 [TenantProvider] Tenant ID resolution:', {
          envTenantId,
          storedTenantId,
          targetTenantId,
          priority: envTenantId ? 'ENVIRONMENT' : storedTenantId ? 'LOCALSTORAGE' : 'DEFAULT'
        });
        
        if (targetTenantId) {
          console.log('✅ [TenantProvider] Loading tenant by ID:', targetTenantId);
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('id, name, slug, subdomain, custom_domain, is_default, settings, status')
            .eq('id', targetTenantId)
            .maybeSingle();

          if (tenantData) {
            const { data: whiteLabel } = await supabase
              .from('white_label_configs')
              .select('brand_identity, mobile_theme, theme_colors, pwa_config, domain_config')
              .eq('tenant_id', tenantData.id)
              .maybeSingle();

            const config: TenantConfig = {
              id: tenantData.id,
              name: tenantData.name,
              slug: tenantData.slug || undefined,
              domain,
              subdomain: tenantData.subdomain || undefined,
              custom_domain: tenantData.custom_domain || undefined,
              status: tenantData.status || 'active',
              branding: (whiteLabel?.brand_identity as BrandingConfig) || {
                company_name: tenantData.name,
                primary_color: '#10b981',
              },
              theme: (whiteLabel?.mobile_theme || whiteLabel?.theme_colors) as ThemeConfig,
              pwa: whiteLabel?.pwa_config as PWAConfig,
              features: (tenantData.settings as any)?.features || [
                'lands', 'schedule', 'chat', 'market', 'weather', 'social'
              ],
              settings: {
                languages: (tenantData.settings as any)?.languages || ['en', 'hi'],
                defaultLanguage: (tenantData.settings as any)?.defaultLanguage || 'hi',
              },
            };

            setTenant(config);
            tenantIsolationService.setTenantContext(config.id, domain);
            applyThemeToDOM(config.branding, config.theme);
            
            // Cache for offline
            await localDB.saveTenantConfig(config.id, whiteLabel, {
              id: config.id,
              name: config.name,
              domain
            });

            console.log('✅ [TenantProvider] Tenant loaded:', config.name);
            return;
          }
        }
      }

      // Production: Look up by domain
      const { data: whitelabelConfigs } = await supabase
        .from('white_label_configs')
        .select('tenant_id, domain_config, brand_identity, mobile_theme, theme_colors, pwa_config');

      const matchedConfig = whitelabelConfigs?.find(wl => {
        const domainConfig = wl.domain_config as any;
        return domainConfig?.farmer_app?.custom_domain === domain ||
               domainConfig?.custom_domain === domain;
      });

      if (matchedConfig) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, name, slug, subdomain, custom_domain, is_default, settings, status')
          .eq('id', matchedConfig.tenant_id)
          .maybeSingle();

        if (tenantData) {
          const config: TenantConfig = {
            id: tenantData.id,
            name: tenantData.name,
            slug: tenantData.slug || undefined,
            domain,
            subdomain: tenantData.subdomain || undefined,
            custom_domain: tenantData.custom_domain || undefined,
            status: tenantData.status || 'active',
            branding: (matchedConfig.brand_identity as BrandingConfig) || {
              company_name: tenantData.name,
              primary_color: '#10b981',
            },
            theme: (matchedConfig.mobile_theme || matchedConfig.theme_colors) as ThemeConfig,
            pwa: matchedConfig.pwa_config as PWAConfig,
            features: (tenantData.settings as any)?.features || [
              'lands', 'schedule', 'chat', 'market', 'weather', 'social'
            ],
            settings: {
              languages: (tenantData.settings as any)?.languages || ['en', 'hi'],
              defaultLanguage: (tenantData.settings as any)?.defaultLanguage || 'hi',
            },
          };

          setTenant(config);
          tenantIsolationService.setTenantContext(config.id, domain);
          applyThemeToDOM(config.branding, config.theme);

          // Cache for offline
          await localDB.saveTenantConfig(config.id, matchedConfig, {
            id: config.id,
            name: config.name,
            domain
          });

          console.log('✅ [TenantProvider] Tenant loaded:', config.name);
          return;
        }
      }

      // Fallback to default tenant (only in development)
      console.warn('⚠️ [TenantProvider] No tenant found for domain, checking environment...');
      
      if (env.isDevelopment) {
        console.log('✅ [TenantProvider] Development mode - fetching default tenant from database');
        
        // First try to get the tenant marked as default
        let { data: defaultTenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('id, name, slug, subdomain, custom_domain, status, settings')
          .eq('is_default', true)
          .eq('status', 'active')
          .maybeSingle();

        // If no default tenant, get the first active tenant
        if (!defaultTenantData && !tenantError) {
          console.log('🔍 [TenantProvider] No default tenant found, fetching first active tenant');
          const { data: firstActiveTenant } = await supabase
            .from('tenants')
            .select('id, name, slug, subdomain, custom_domain, status, settings')
            .eq('status', 'active')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          
          defaultTenantData = firstActiveTenant;
        }

        if (defaultTenantData) {
          console.log('✅ [TenantProvider] Found default tenant:', defaultTenantData.name, defaultTenantData.id);
          
          // Fetch white label config for the default tenant
          const { data: whiteLabel } = await supabase
            .from('white_label_configs')
            .select('brand_identity, mobile_theme, theme_colors, pwa_config, domain_config')
            .eq('tenant_id', defaultTenantData.id)
            .maybeSingle();

          const defaultTenant: TenantConfig = {
            id: defaultTenantData.id,
            name: defaultTenantData.name,
            slug: defaultTenantData.slug || undefined,
            domain: domain,
            subdomain: defaultTenantData.subdomain || undefined,
            custom_domain: defaultTenantData.custom_domain || undefined,
            status: defaultTenantData.status || 'active',
            settings: {
              languages: (defaultTenantData.settings as any)?.languages || ['en', 'hi'],
              defaultLanguage: (defaultTenantData.settings as any)?.defaultLanguage || 'en',
              timezone: (defaultTenantData.settings as any)?.timezone || 'Asia/Kolkata',
              currency: (defaultTenantData.settings as any)?.currency || 'INR'
            },
            branding: (whiteLabel?.brand_identity as BrandingConfig) || {
              company_name: defaultTenantData.name,
              primary_color: '#22c55e',
              secondary_color: '#16a34a',
              accent_color: '#84cc16'
            },
            theme: (whiteLabel?.mobile_theme || whiteLabel?.theme_colors) as ThemeConfig,
            pwa: whiteLabel?.pwa_config as PWAConfig,
            features: (defaultTenantData.settings as any)?.features || ['ai_chat', 'weather', 'marketplace', 'social', 'analytics']
          };
          
          setTenant(defaultTenant);
          setLastUpdated(new Date());
          tenantIsolationService.setTenantContext(defaultTenant.id, domain);
          applyThemeToDOM(defaultTenant.branding, defaultTenant.theme);
          
          // Cache the development tenant
          localStorage.setItem('tenantId', defaultTenant.id);
          localStorage.setItem('tenant_config_cache', JSON.stringify({
            data: defaultTenant,
            timestamp: Date.now()
          }));
          
          return;
        } else {
          console.error('❌ [TenantProvider] No active tenants found in database');
          throw new Error('No active tenants found in database. Please create at least one tenant with status="active".');
        }
      } else {
        // In production with custom domain, this is a critical error
        console.error('❌ [TenantProvider] No tenant found for production domain:', domain);
        throw new Error(`No tenant configured for domain: ${domain}. Please check your DNS and tenant configuration.`);
      }

    } catch (err) {
      const domain = getCurrentDomain();
      const env = getEnvironment();
      
      console.error('❌ [TenantProvider] Error fetching tenant:', err);
      console.error('❌ [TenantProvider] Error details:', {
        message: (err as Error)?.message,
        domain,
        environment: env.isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION',
      });
      
      // In development, try offline cache and continue (don't block the app)
      // In production, this is a critical error
      if (!env.isDevelopment) {
        setError(err as Error);
      }

      // Try to load from offline cache as last resort
      try {
        const storedTenantId = localStorage.getItem('tenantId');
        if (!storedTenantId) {
          console.warn('⚠️ [TenantProvider] No cached tenant ID found in localStorage');
          if (env.isDevelopment) {
            // In development, create a fallback tenant to keep the app running
            const fallbackTenant: TenantConfig = {
              id: 'development',
              name: 'Development Mode',
              domain: domain,
              branding: {
                company_name: 'KisanShakti',
                primary_color: '#10b981',
                secondary_color: '#059669',
                accent_color: '#14b8a6'
              },
              features: ['lands', 'schedule', 'chat', 'market', 'weather', 'social'],
              settings: {
                languages: ['en', 'hi'],
                defaultLanguage: 'en',
              },
            };
            setTenant(fallbackTenant);
            applyThemeToDOM(fallbackTenant.branding);
          }
          return;
        }

        const cachedConfig = await localDB.getTenantConfig(storedTenantId);
        if (cachedConfig?.tenant_data) {
          console.log('📦 [TenantProvider] Loaded tenant from offline cache');
          const config: TenantConfig = {
            id: cachedConfig.tenant_data.id,
            name: cachedConfig.tenant_data.name,
            domain: cachedConfig.tenant_data.domain,
            branding: (cachedConfig.white_label_config?.brand_identity as BrandingConfig) || {
              company_name: cachedConfig.tenant_data.name,
              primary_color: '#10b981',
            },
            theme: (cachedConfig.white_label_config?.mobile_theme || cachedConfig.white_label_config?.theme_colors) as ThemeConfig,
            features: [],
            settings: {
              languages: ['en', 'hi'],
              defaultLanguage: 'hi',
            },
          };
          setTenant(config);
          applyThemeToDOM(config.branding, config.theme);
        }
      } catch (cacheErr) {
        console.error('❌ [TenantProvider] Failed to load from cache:', cacheErr);
      }
    } finally {
      setIsLoading(false);
    }
  }, [getCurrentDomain, applyThemeToDOM]);

  // Clear cache and refetch (for theme updates)
  const clearCache = useCallback(() => {
    console.log('[TenantProvider] 🗑️ Clearing cache and refetching...');
    localStorage.removeItem('tenant_config_cache');
    fetchTenantConfig();
  }, [fetchTenantConfig]);

  // Listen for theme update events
  useEffect(() => {
    const handleThemeUpdate = () => {
      console.log('[TenantProvider] 🎨 Theme update event received');
      clearCache();
    };
    
    window.addEventListener('theme-updated', handleThemeUpdate);
    return () => window.removeEventListener('theme-updated', handleThemeUpdate);
  }, [clearCache]);

  // Initial load
  useEffect(() => {
    const domain = getCurrentDomain();
    setCurrentDomain(domain);
    fetchTenantConfig();
  }, [getCurrentDomain, fetchTenantConfig]);

  // Re-fetch if domain changes
  useEffect(() => {
    const domain = getCurrentDomain();
    if (domain !== currentDomain && currentDomain !== '') {
      console.log('🔄 [TenantProvider] Domain changed, refetching tenant');
      setCurrentDomain(domain);
      fetchTenantConfig();
    }
  }, [getCurrentDomain, currentDomain, fetchTenantConfig]);

  // Detect tenant changes and reset stores
  useEffect(() => {
    if (tenant?.id && prevTenantIdRef.current && prevTenantIdRef.current !== tenant.id) {
      console.log('🔄 [TenantProvider] Tenant ID changed!', { 
        from: prevTenantIdRef.current, 
        to: tenant.id 
      });
      
      // Reset all tenant-specific stores
      resetTenantStores().then((result) => {
        if (result.success) {
          console.log('✅ [TenantProvider] Stores reset successfully for tenant switch');
        } else {
          console.error('❌ [TenantProvider] Failed to reset stores:', result.error);
        }
      });
      
      // Note: We don't force reload here to allow smooth tenant switching
      // The app will naturally re-fetch data with the new tenant context
    }
    
    prevTenantIdRef.current = tenant?.id || null;
  }, [tenant?.id]);

  const value: TenantContextValue = {
    tenant,
    branding: tenant?.branding || null,
    theme: tenant?.theme || null,
    features: tenant?.features || [],
    isLoading,
    error,
    refetch: fetchTenantConfig,
    clearCache,
    lastUpdated,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

// ============= Hook =============

export const useTenant = (): TenantContextValue => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
