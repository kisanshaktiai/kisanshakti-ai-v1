import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { WhiteLabelService } from '@/services/WhiteLabelService';
import { localDB } from '@/services/localDB';

interface BrandIdentity {
  logo_url?: string;
  favicon_url?: string;
  company_name?: string;
  tagline?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  font_family?: string;
  custom_fonts?: any[];
  brand_color?: string;
  text_color?: string;
  background_color?: string;
  border_color?: string;
  success_color?: string;
  warning_color?: string;
  error_color?: string;
  info_color?: string;
}

interface AppCustomization {
  theme_mode?: 'light' | 'dark' | 'system';
  navigation_style?: string;
  layout_style?: string;
  component_styles?: any;
  custom_css?: string;
  animations_enabled?: boolean;
  animation_preset?: string;
  transition_duration?: number;
  respect_reduce_motion?: boolean;
  visible_modules?: any;
  language_settings?: {
    default?: string;
    supported?: string[];
  };
}

interface EmailTemplates {
  welcome_template_subject?: string;
  reset_template_subject?: string;
  notification_template_subject?: string;
  header_color?: string;
  footer_text?: string;
}

interface DomainConfig {
  custom_domain?: string;
  subdomain?: string;
  ssl_enabled?: boolean;
  redirect_urls?: string[];
}

interface WhiteLabelConfig {
  brand_identity?: BrandIdentity;
  app_customization?: AppCustomization;
  pwa_config?: {
    app_name?: string;
    short_name?: string;
    description?: string;
    theme_color?: string;
    background_color?: string;
    display?: string;
    orientation?: string;
    start_url?: string;
    scope?: string;
    icons?: any[];
  };
  splash_screens?: {
    mobile?: string;
    mobile_splash?: string;
    android?: {
      url?: string;
      backgroundColor?: string;
    };
    tablet?: string;
    desktop?: string;
    loading_text?: string;
    loading_color?: string;
  };
  email_templates?: EmailTemplates;
  domain_config?: DomainConfig;
  css_injection?: {
    custom_css?: string;
    mobile_css?: string;
    print_css?: string;
    enabled?: boolean;
  };
  app_store_config?: {
    app_name?: string;
    category?: string;
    keywords?: string[];
  };
  distribution?: {
    pwa_enabled?: boolean;
    pwa_offline_support?: boolean;
    auto_updates?: boolean;
    update_check_interval?: number;
    private_store_enabled?: boolean;
  };
  content_management?: {
    custom_messaging_enabled?: boolean;
    faq_items?: any[];
  };
}

interface Tenant {
  id: string;
  name: string;
  domain: string;
  whiteLabel?: WhiteLabelConfig;
  settings: {
    languages: string[];
    defaultLanguage: string;
    features: string[];
  };
}

interface TenantState {
  tenant: Tenant | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchTenant: () => Promise<void>;
  applyWhiteLabelTheme: (whiteLabel: WhiteLabelConfig) => void;
  clearError: () => void;
  listenForTenantChanges: () => void;
}

export const useTenantStore = create<TenantState>((set, get) => ({
  tenant: null,
  isLoading: false,
  error: null,

  fetchTenant: async () => {
    set({ isLoading: true, error: null });
    try {
      // Get current domain
      const domain = window.location.hostname;
      
      // Check if running in development (Lovable sandbox)
      const isDevelopment = domain.includes('sandbox.lovable.dev') || domain === 'localhost';
      
      let tenantData = null;
      let whiteLabelData = null;
      let error = null;
      
      // Check if offline and try to load from cache
      if (!navigator.onLine) {
        console.log('📴 [Tenant] Offline detected, attempting to load from localDB cache...');
        const storedTenantId = localStorage.getItem('tenantId');
        
        if (storedTenantId) {
          try {
            const cachedConfig = await localDB.getTenantConfig(storedTenantId);
            
            if (cachedConfig) {
              console.log('✅ [Tenant] Loaded tenant configuration from offline cache');
              
              // Reconstruct tenant object from cache
              tenantData = cachedConfig.tenant_data;
              whiteLabelData = cachedConfig.white_label_config;
              
              // Skip online fetch, use cached data
              const tenant: Tenant = {
                id: tenantData.id,
                name: tenantData.name,
                domain: domain,
                whiteLabel: whiteLabelData,
                settings: {
                  languages: ['en', 'hi', 'pa', 'mr', 'ta'],
                  defaultLanguage: 'hi',
                  features: ['weather', 'market', 'advisory', 'schemes'],
                },
              };
              
              set({ tenant, isLoading: false });
              get().applyWhiteLabelTheme(tenant.whiteLabel!);
              
              console.log('✅ [Tenant] Offline mode: Using cached tenant configuration');
              return;
            }
          } catch (cacheError) {
            console.warn('⚠️ [Tenant] Failed to load from cache:', cacheError);
          }
        }
      }
      
      if (isDevelopment) {
        // In development, first try to get tenant from localStorage (for persistence)
        const storedTenantId = localStorage.getItem('tenantId');
        
        if (storedTenantId) {
          // Try to load the stored tenant
          const { data: storedTenant, error: storedError } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', storedTenantId)
            .maybeSingle();
          
          if (storedTenant && !storedError) {
            tenantData = storedTenant;
          }
        }
        
        // If no stored tenant or loading failed, use default
        if (!tenantData) {
          // Try to find the KisanShakti tenant specifically
          const { data, error: defaultError } = await supabase
            .from('tenants')
            .select('*')
            .eq('slug', 'kisanshakti-ai')
            .maybeSingle();
          
          if (data) {
            tenantData = data;
          } else {
            // Fallback to any tenant marked as default
            const { data: defaultData, error: fallbackError } = await supabase
              .from('tenants')
              .select('*')
              .eq('is_default', true)
              .maybeSingle();
            
            tenantData = defaultData;
            error = fallbackError;
          }
        }
      } else {
        // PRODUCTION: Multi-stage domain lookup
        console.log('🔍 [Tenant] Starting multi-stage domain lookup for:', domain);
        
        // STAGE 1: Exact custom_domain match in tenants table
        const { data: exactMatch, error: exactError } = await supabase
          .from('tenants')
          .select('*')
          .eq('custom_domain', domain)
          .maybeSingle();
        
        if (exactMatch) {
          console.log('✅ [Stage 1] Found by tenants.custom_domain');
          tenantData = exactMatch;
        }
        
        // STAGE 2: Full subdomain match in tenants table
        if (!tenantData) {
          const { data: subdomainMatch, error: subError } = await supabase
            .from('tenants')
            .select('*')
            .eq('subdomain', domain)
            .maybeSingle();
          
          if (subdomainMatch) {
            console.log('✅ [Stage 2] Found by tenants.subdomain (full match)');
            tenantData = subdomainMatch;
          }
        }
        
        // STAGE 3: Check white_label_configs.domain_config
        // IMPORTANT: This is a farmer app skeleton, so we prioritize farmer_app domains
        if (!tenantData) {
          console.log('🔍 [Stage 3] Checking white_label_configs (farmer_app domains)...');
          
          const { data: whitelabelConfigs } = await supabase
            .from('white_label_configs')
            .select('tenant_id, domain_config');
          
          if (whitelabelConfigs) {
            const matchedConfig = whitelabelConfigs.find(wl => {
              const domainConfig = wl.domain_config as any;
              
              // PRIORITY 1: Check farmer_app.custom_domain (main use case for this skeleton)
              if (domainConfig?.farmer_app?.custom_domain === domain) {
                console.log('✅ [Stage 3] Matched farmer_app.custom_domain');
                return true;
              }
              
              // PRIORITY 2: Check flat structure custom_domain (legacy support)
              if (domainConfig?.custom_domain === domain) {
                console.log('✅ [Stage 3] Matched flat custom_domain (legacy)');
                return true;
              }
              
              // PRIORITY 3: Check subdomain (legacy support)
              if (domainConfig?.subdomain === domain) {
                console.log('✅ [Stage 3] Matched subdomain (legacy)');
                return true;
              }
              
              return false;
            });
            
            if (matchedConfig) {
              console.log('🎯 [Stage 3] Found domain in white_label_configs, fetching tenant...');
              
              const { data: tenantFromWL } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', matchedConfig.tenant_id)
                .single();
              
              if (tenantFromWL) {
                console.log('✅ [Stage 3] Loaded tenant:', tenantFromWL.name);
                tenantData = tenantFromWL;
              }
            }
          }
        }
        
        // STAGE 4: Partial subdomain match (ONLY if base domain matches)
        if (!tenantData) {
          const parts = domain.split('.');
          if (parts.length >= 2) {
            const subdomain = parts[0];
            const baseDomain = parts.slice(-2).join('.');
            
            console.log('🔍 [Stage 4] Trying partial subdomain match:', { subdomain, baseDomain });
            
            const { data: partialMatches } = await supabase
              .from('tenants')
              .select('*')
              .or(`subdomain.eq.${subdomain},custom_domain.ilike.%${baseDomain}%`);
            
            if (partialMatches && partialMatches.length > 0) {
              // Prioritize match with same base domain
              tenantData = partialMatches.find(t => 
                t.custom_domain?.includes(baseDomain) ||
                t.subdomain?.includes(baseDomain)
              ) || partialMatches[0];
              
              if (tenantData) {
                console.log('⚠️ [Stage 4] Found via partial match (verify correct):', tenantData.name);
              }
            }
          }
        }
        
        error = exactError;
      }

      // Fetch white label config or tenant branding if tenant found
      if (tenantData?.id) {
        // Store tenant context for security isolation
        localStorage.setItem('tenantId', tenantData.id);
        localStorage.setItem('tenantDomain', domain);
        
        console.log('✅ [Security] Tenant loaded:', {
          id: tenantData.id,
          name: tenantData.name,
          domain: domain
        });
        
        // Initialize tenant-scoped database
        console.log('🔐 [Security] Initializing tenant-scoped database:', `KisanDB_${tenantData.id}`);
        
        // First try white_label_configs
        console.log('🔍 [Tenant] Fetching white_label_configs for tenant:', tenantData.id);
        const { data: whiteLabel, error: wlError } = await supabase
          .from('white_label_configs')
          .select('*')
          .eq('tenant_id', tenantData.id)
          .maybeSingle();
        
        if (wlError) {
          console.error('❌ [Tenant] Error fetching white_label_configs:', wlError);
        }
        
        if (whiteLabel) {
          console.log('✅ [Tenant] Found white_label_configs:', {
            hasLogo: !!(whiteLabel as any).brand_identity?.logo_url,
            hasPrimaryColor: !!(whiteLabel as any).brand_identity?.primary_color,
            hasThemeColors: !!(whiteLabel as any).theme_colors,
            brandIdentity: (whiteLabel as any).brand_identity
          });
          whiteLabelData = whiteLabel;
        } else {
          // Fallback to tenant_branding table
          const { data: branding } = await supabase
            .from('tenant_branding')
            .select('*')
            .eq('tenant_id', tenantData.id)
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (branding) {
            // Convert tenant_branding to white_label_config format
            whiteLabelData = {
              brand_identity: {
                company_name: branding.app_name || tenantData.name,
                tagline: branding.app_tagline || 'Empowering Farmers with Technology',
                logo_url: branding.logo_url,
                favicon_url: branding.favicon_url,
                primary_color: branding.primary_color || '#16a34a',
                secondary_color: branding.secondary_color || '#65a30d',
                accent_color: branding.accent_color || '#84cc16',
                background_color: branding.background_color || '#f0fdf4',
                text_color: branding.text_color || '#166534',
                font_family: branding.font_family || 'Inter',
                description: branding.company_description
              },
                app_customization: {
                  theme_mode: (branding.settings as any)?.enable_dark_mode === false ? 'light' : 'system',
                  custom_css: branding.custom_css
                },
              splash_screens: branding.splash_screen_url ? {
                mobile: branding.splash_screen_url,
                mobile_splash: branding.splash_screen_url
              } : undefined,
              pwa_config: branding.app_icon_url ? {
                icons: [{ src: branding.app_icon_url }]
              } : undefined
            };
          }
        }
      }
      
      if (error || !tenantData) {
        // If no tenant found or error, try to get default tenant
        const { data: defaultTenant } = await supabase
          .from('tenants')
          .select('*')
          .eq('is_default', true)
          .maybeSingle();

        if (defaultTenant) {
          localStorage.setItem('tenantId', defaultTenant.id);
          
          // Try to get white label config for default tenant
          let whiteLabel: any = null;
          const { data: whiteLabelConfig } = await supabase
            .from('white_label_configs')
            .select('*')
            .eq('tenant_id', defaultTenant.id)
            .maybeSingle();
          
          if (whiteLabelConfig) {
            whiteLabel = whiteLabelConfig;
          } else {
            // Fallback to tenant_branding table
            const { data: branding } = await supabase
              .from('tenant_branding')
              .select('*')
              .eq('tenant_id', defaultTenant.id)
              .order('version', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (branding) {
              // Convert tenant_branding to white_label_config format
              whiteLabel = {
                brand_identity: {
                  company_name: branding.app_name || defaultTenant.name,
                  tagline: branding.app_tagline || 'Empowering Farmers with Technology',
                  logo_url: branding.logo_url,
                  favicon_url: branding.favicon_url,
                  primary_color: branding.primary_color || '#16a34a',
                  secondary_color: branding.secondary_color || '#65a30d',
                  accent_color: branding.accent_color || '#84cc16',
                  background_color: branding.background_color || '#f0fdf4',
                  text_color: branding.text_color || '#166534',
                  font_family: branding.font_family || 'Inter',
                  description: branding.company_description
                },
                app_customization: {
                  theme_mode: (branding.settings as any)?.enable_dark_mode === false ? 'light' : 'system',
                  custom_css: branding.custom_css
                },
                splash_screens: branding.splash_screen_url ? {
                  mobile: branding.splash_screen_url,
                  mobile_splash: branding.splash_screen_url
                } : undefined,
                pwa_config: branding.app_icon_url ? {
                  icons: [{ src: branding.app_icon_url }]
                } : undefined
              };
            }
          }
          
          const settingsObj = typeof defaultTenant.settings === 'object' && defaultTenant.settings !== null 
            ? defaultTenant.settings as any 
            : {};
          
          const tenant: Tenant = {
            id: defaultTenant.id,
            name: defaultTenant.name,
            domain: domain,
            whiteLabel: whiteLabel ? {
              brand_identity: {
                ...(typeof whiteLabel.brand_identity === 'object' && whiteLabel.brand_identity !== null ? whiteLabel.brand_identity : {}),
                logo_url: (typeof whiteLabel.brand_identity === 'object' && whiteLabel.brand_identity !== null ? (whiteLabel.brand_identity as any).logo_url : undefined),
                favicon_url: (typeof whiteLabel.brand_identity === 'object' && whiteLabel.brand_identity !== null ? (whiteLabel.brand_identity as any).favicon_url : undefined),
              },
              app_customization: typeof whiteLabel.app_customization === 'object' && whiteLabel.app_customization !== null ? whiteLabel.app_customization as AppCustomization : {},
              pwa_config: typeof whiteLabel.pwa_config === 'object' && whiteLabel.pwa_config !== null ? whiteLabel.pwa_config as any : undefined,
            } : {
              brand_identity: {
                company_name: defaultTenant.name,
                tagline: 'Digital Agriculture Platform',
                primary_color: '#10b981',
                secondary_color: '#059669',
                accent_color: '#14b8a6'
              },
              app_customization: {
                theme_mode: 'system',
                language_settings: {
                  default: 'hi',
                  supported: ['en', 'hi', 'pa', 'mr', 'ta']
                }
              }
            },
            settings: {
              languages: settingsObj.languages || ['en', 'hi', 'pa', 'mr', 'ta'],
              defaultLanguage: settingsObj.defaultLanguage || 'hi',
              features: settingsObj.features || ['weather', 'market', 'advisory', 'schemes'],
            },
          };
          set({ tenant, isLoading: false });
          
          // Apply white label theme if available
          if (whiteLabel) {
            get().applyWhiteLabelTheme(tenant.whiteLabel!);
          }
        } else {
          // Create a fallback tenant configuration
          const fallbackTenant: Tenant = {
            id: 'a2a59533-b5d2-450c-bd70-7180aa40d82d', // KisanShakti default ID
            name: 'KisanShakti Ai',
            domain: domain,
            whiteLabel: {
              brand_identity: {
                company_name: 'KisanShakti Ai',
                tagline: 'Empowering Farmers Digitally',
                primary_color: '#10b981',
                secondary_color: '#059669',
                accent_color: '#14b8a6'
              },
              app_customization: {
                theme_mode: 'system',
                language_settings: {
                  default: 'hi',
                  supported: ['en', 'hi', 'pa', 'mr', 'ta']
                }
              }
            },
            settings: {
              languages: ['en', 'hi', 'pa', 'mr', 'ta'],
              defaultLanguage: 'hi',
              features: ['weather', 'market', 'advisory', 'schemes'],
            },
          };
          
          // Store the fallback tenant ID
          localStorage.setItem('tenantId', fallbackTenant.id);
          set({ tenant: fallbackTenant, isLoading: false });
        }
      } else {
        // Transform database tenant to our Tenant interface
        const settingsObj = typeof tenantData.settings === 'object' && tenantData.settings !== null 
          ? tenantData.settings as any 
          : {};
          
        const tenant: Tenant = {
          id: tenantData.id,
          name: tenantData.name,
          domain: domain,
          whiteLabel: whiteLabelData ? {
            brand_identity: {
              ...(typeof whiteLabelData.brand_identity === 'object' && whiteLabelData.brand_identity !== null ? whiteLabelData.brand_identity : {}),
              logo_url: (typeof whiteLabelData.brand_identity === 'object' && whiteLabelData.brand_identity !== null ? (whiteLabelData.brand_identity as any).logo_url : undefined),
              favicon_url: (typeof whiteLabelData.brand_identity === 'object' && whiteLabelData.brand_identity !== null ? (whiteLabelData.brand_identity as any).favicon_url : undefined),
            },
            app_customization: typeof whiteLabelData.app_customization === 'object' && whiteLabelData.app_customization !== null ? whiteLabelData.app_customization as AppCustomization : {},
            pwa_config: typeof whiteLabelData.pwa_config === 'object' && whiteLabelData.pwa_config !== null ? whiteLabelData.pwa_config as any : undefined,
          } : {
            brand_identity: {
              company_name: tenantData.name,
              tagline: 'Digital Agriculture Platform',
              primary_color: '#10b981',
              secondary_color: '#059669',
              accent_color: '#14b8a6'
            },
            app_customization: {
              theme_mode: 'system',
              language_settings: {
                default: settingsObj.defaultLanguage || 'hi',
                supported: settingsObj.languages || ['en', 'hi', 'pa', 'mr', 'ta']
              }
            }
          },
          settings: {
            languages: settingsObj.languages || ['en', 'hi', 'pa', 'mr', 'ta'],
            defaultLanguage: settingsObj.defaultLanguage || 'hi',
            features: settingsObj.features || [
              'lands', 'schedule', 'chat', 'market', 
              'weather', 'social', 'ndvi', 'schemes', 
              'analytics', 'profile'
            ],
          },
        };

        set({ tenant, isLoading: false });
        
        // Save tenant configuration to localDB for offline use
        try {
          await localDB.saveTenantConfig(
            tenantData.id,
            whiteLabelData,
            {
              id: tenantData.id,
              name: tenantData.name,
              domain: domain
            }
          );
          console.log('💾 [Tenant] Saved configuration to localDB for offline use');
        } catch (error) {
          console.error('❌ [Tenant] Failed to cache config in localDB:', error);
        }
        
        // Apply white label theme if available
        if (whiteLabelData) {
          console.log('🎨 [Tenant] Applying white label theme after tenant load');
          get().applyWhiteLabelTheme(tenant.whiteLabel!);
        } else {
          console.warn('⚠️ [Tenant] No white label data found for tenant:', tenantData.name);
        }
        
        // Update manifest link on tenant load
        updateManifestLink();
      }
    } catch (error: any) {
      console.error('Error fetching tenant:', error);
      // Error fetching tenant
      set({
        tenant: null,
        isLoading: false,
        error: error.message || 'Failed to fetch tenant configuration',
      });
    }
  },

  applyWhiteLabelTheme: (whiteLabel) => {
    console.log('🎨 [Theme] Starting theme application...');
    console.log('🎨 [Theme] White label config:', {
      hasBrandIdentity: !!whiteLabel.brand_identity,
      hasThemeColors: !!(whiteLabel as any).theme_colors,
      hasPwaConfig: !!whiteLabel.pwa_config
    });
    
    // Apply custom theme to CSS variables
    const root = document.documentElement;
    
    // Helper function to ensure HSL format
    const ensureHSL = (color: string): string => {
      if (!color) return '';
      
      // If already in HSL format (contains % sign), return as is
      if (color.includes('%')) return color;
      
      // If it's a hex color, convert to HSL
      if (color.startsWith('#')) {
        return hexToHSL(color);
      }
      
      // If it's an RGB color, convert to HSL
      if (color.startsWith('rgb')) {
        // Extract numbers from rgb/rgba string
        const matches = color.match(/\d+/g);
        if (matches && matches.length >= 3) {
          const [r, g, b] = matches.map(Number);
          return rgbToHSL(r, g, b);
        }
      }
      
      // If it's just numbers (like "142 76 36"), assume it's HSL without % signs
      const numbers = color.match(/\d+/g);
      if (numbers && numbers.length === 3) {
        const [h, s, l] = numbers;
        return `${h} ${s}% ${l}%`;
      }
      
      // Default return the color as is
      return color;
    };
    
    // Apply theme colors if available (from new theme_colors column)
    const themeColors = (whiteLabel as any).theme_colors;
    if (themeColors) {
      // Apply core colors
      if (themeColors.core) {
        Object.entries(themeColors.core).forEach(([key, value]) => {
          if (value) {
            const hslValue = ensureHSL(String(value));
            if (hslValue) {
              root.style.setProperty(`--${key.replace(/_/g, '-')}`, hslValue);
            }
          }
        });
      }
      
      // Apply navigation colors
      if (themeColors.navigation) {
        Object.entries(themeColors.navigation).forEach(([key, value]) => {
          if (value) {
            const hslValue = ensureHSL(String(value));
            if (hslValue) {
              root.style.setProperty(`--${key.replace(/_/g, '-')}`, hslValue);
            }
          }
        });
      }
      
      // Apply chart colors
      if (themeColors.charts) {
        Object.entries(themeColors.charts).forEach(([key, value]) => {
          if (value) {
            const hslValue = ensureHSL(String(value));
            if (hslValue) {
              root.style.setProperty(`--${key.replace(/_/g, '-')}`, hslValue);
            }
          }
        });
      }
      
      // Apply map colors
      if (themeColors.maps) {
        Object.entries(themeColors.maps).forEach(([key, value]) => {
          if (value) {
            const hslValue = ensureHSL(String(value));
            if (hslValue) {
              root.style.setProperty(`--${key.replace(/_/g, '-')}`, hslValue);
            }
          }
        });
      }
      
      // Apply weather colors
      if (themeColors.weather) {
        Object.entries(themeColors.weather).forEach(([key, value]) => {
          if (value) {
            const hslValue = ensureHSL(String(value));
            if (hslValue) {
              root.style.setProperty(`--${key.replace(/_/g, '-')}`, hslValue);
            }
          }
        });
      }
      
      // Apply gradients - these may contain multiple colors
      if (themeColors.gradients) {
        Object.entries(themeColors.gradients).forEach(([key, value]) => {
          if (value) {
            // Gradients are complex, don't convert them
            root.style.setProperty(`--gradient-${key}`, String(value));
          }
        });
      }
      
      // Apply dark mode colors if enabled
      if (themeColors.dark_mode?.enabled && themeColors.dark_mode?.colors) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          Object.entries(themeColors.dark_mode.colors).forEach(([key, value]) => {
            if (value) {
              const hslValue = ensureHSL(String(value));
              if (hslValue) {
                root.style.setProperty(`--${key.replace(/_/g, '-')}`, hslValue);
              }
            }
          });
        }
      }
    }
    
    // Fallback to brand identity colors if theme_colors not available
    const brandIdentity = whiteLabel.brand_identity;
    
    // Primary colors
    if (brandIdentity?.primary_color) {
      const hslColor = brandIdentity.primary_color.startsWith('#') 
        ? hexToHSL(brandIdentity.primary_color)
        : brandIdentity.primary_color;
      root.style.setProperty('--primary', hslColor);
      root.style.setProperty('--primary-foreground', '0 0% 100%'); // White text on primary
    }
    
    // Secondary colors
    if (brandIdentity?.secondary_color) {
      const hslColor = brandIdentity.secondary_color.startsWith('#')
        ? hexToHSL(brandIdentity.secondary_color)
        : brandIdentity.secondary_color;
      root.style.setProperty('--secondary', hslColor);
      root.style.setProperty('--secondary-foreground', '0 0% 0%'); // Black text on secondary
    }
    
    // Accent colors
    if (brandIdentity?.accent_color) {
      const hslColor = brandIdentity.accent_color.startsWith('#')
        ? hexToHSL(brandIdentity.accent_color)
        : brandIdentity.accent_color;
      root.style.setProperty('--accent', hslColor);
      root.style.setProperty('--accent-foreground', '0 0% 0%'); // Black text on accent
    }
    
    // Background and foreground colors
    if (brandIdentity?.background_color) {
      const hslColor = brandIdentity.background_color.startsWith('#')
        ? hexToHSL(brandIdentity.background_color)
        : brandIdentity.background_color;
      root.style.setProperty('--background', hslColor);
    }
    
    if (brandIdentity?.text_color) {
      const hslColor = brandIdentity.text_color.startsWith('#')
        ? hexToHSL(brandIdentity.text_color)
        : brandIdentity.text_color;
      root.style.setProperty('--foreground', hslColor);
    }
    
    // Border and muted colors
    if (brandIdentity?.border_color) {
      const hslColor = brandIdentity.border_color.startsWith('#')
        ? hexToHSL(brandIdentity.border_color)
        : brandIdentity.border_color;
      root.style.setProperty('--border', hslColor);
      root.style.setProperty('--input', hslColor);
    }
    
    // Status colors
    if (brandIdentity?.success_color) {
      const hslColor = brandIdentity.success_color.startsWith('#')
        ? hexToHSL(brandIdentity.success_color)
        : brandIdentity.success_color;
      root.style.setProperty('--success', hslColor);
    }
    
    if (brandIdentity?.warning_color) {
      const hslColor = brandIdentity.warning_color.startsWith('#')
        ? hexToHSL(brandIdentity.warning_color)
        : brandIdentity.warning_color;
      root.style.setProperty('--warning', hslColor);
    }
    
    if (brandIdentity?.error_color) {
      const hslColor = brandIdentity.error_color.startsWith('#')
        ? hexToHSL(brandIdentity.error_color)
        : brandIdentity.error_color;
      root.style.setProperty('--destructive', hslColor);
    }
    
    if (brandIdentity?.info_color) {
      const hslColor = brandIdentity.info_color.startsWith('#')
        ? hexToHSL(brandIdentity.info_color)
        : brandIdentity.info_color;
      root.style.setProperty('--info', hslColor);
    }
    
    // Font family
    if (brandIdentity?.font_family) {
      root.style.setProperty('--font-sans', brandIdentity.font_family);
      document.body.style.fontFamily = brandIdentity.font_family;
    }
    
    // Apply PWA config if available
    if (whiteLabel.pwa_config?.theme_color) {
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', whiteLabel.pwa_config.theme_color);
      } else {
        const meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.content = whiteLabel.pwa_config.theme_color;
        document.head.appendChild(meta);
      }
    }
    
    // Apply logo URL as CSS variable for components to use
    if (brandIdentity?.logo_url) {
      root.style.setProperty('--brand-logo-url', `url('${brandIdentity.logo_url}')`);
      // Also store in localStorage for offline access
      localStorage.setItem('brand_logo_url', brandIdentity.logo_url);
      console.log('🎨 [Theme] Applied brand logo:', brandIdentity.logo_url);
    }
    
    // Store company name for components
    if (brandIdentity?.company_name) {
      localStorage.setItem('brand_company_name', brandIdentity.company_name);
      console.log('🎨 [Theme] Applied company name:', brandIdentity.company_name);
    }
    
    // Apply favicon if available
    if (brandIdentity?.favicon_url) {
      const existingFavicon = document.querySelector('link[rel="icon"]');
      if (existingFavicon) {
        existingFavicon.setAttribute('href', brandIdentity.favicon_url);
      } else {
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = brandIdentity.favicon_url;
        document.head.appendChild(link);
      }
      console.log('🎨 [Theme] Applied favicon:', brandIdentity.favicon_url);
    }
    
    // Update PWA manifest dynamically
    updateManifestLink();
    
    // Apply custom CSS if available
    if (whiteLabel.css_injection?.enabled && whiteLabel.css_injection?.custom_css) {
      const styleId = 'white-label-custom-css';
      let styleElement = document.getElementById(styleId);
      
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
      }
      
      styleElement.textContent = whiteLabel.css_injection.custom_css;
    }
    
    // Apply mobile-specific CSS if on mobile
    if (whiteLabel.css_injection?.enabled && whiteLabel.css_injection?.mobile_css && /Mobi|Android/i.test(navigator.userAgent)) {
      const mobileStyleId = 'white-label-mobile-css';
      let mobileStyleElement = document.getElementById(mobileStyleId);
      
      if (!mobileStyleElement) {
        mobileStyleElement = document.createElement('style');
        mobileStyleElement.id = mobileStyleId;
        document.head.appendChild(mobileStyleElement);
      }
      
      mobileStyleElement.textContent = whiteLabel.css_injection.mobile_css;
    }
    
    // Apply animations settings
    if (whiteLabel.app_customization) {
      if (whiteLabel.app_customization.animations_enabled === false) {
        root.style.setProperty('--animation-duration', '0s');
      } else if (whiteLabel.app_customization.transition_duration) {
        root.style.setProperty('--animation-duration', `${whiteLabel.app_customization.transition_duration}ms`);
      }
      
      // Respect reduced motion if configured
      if (whiteLabel.app_customization.respect_reduce_motion && 
          window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        root.style.setProperty('--animation-duration', '0s');
      }
    }
    
    // Update page title and meta tags
    if (whiteLabel.brand_identity?.company_name) {
      document.title = `${whiteLabel.brand_identity.company_name} - ${whiteLabel.brand_identity.tagline || 'Digital Agriculture Platform'}`;
    }
    
    // Update meta description
    if (whiteLabel.brand_identity?.tagline) {
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', whiteLabel.brand_identity.tagline);
      }
    }
    
    // Update Open Graph tags
    if (whiteLabel.brand_identity?.company_name) {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        ogTitle.setAttribute('content', `${whiteLabel.brand_identity.company_name} - ${whiteLabel.brand_identity.tagline || 'Digital Platform'}`);
      }
      
      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      if (twitterTitle) {
        twitterTitle.setAttribute('content', whiteLabel.brand_identity.company_name);
      }
    }
    
    if (whiteLabel.brand_identity?.tagline) {
      const ogDescription = document.querySelector('meta[property="og:description"]');
      if (ogDescription) {
        ogDescription.setAttribute('content', whiteLabel.brand_identity.tagline);
}

// Helper function to convert RGB to HSL
function rgbToHSL(r: number, g: number, b: number): string {
  // Normalize RGB values to 0-1 range
  r = r / 255;
  g = g / 255;
  b = b / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  // Return in Tailwind CSS format (space-separated, with % for s and l)
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
      
      const twitterDescription = document.querySelector('meta[name="twitter:description"]');
      if (twitterDescription) {
        twitterDescription.setAttribute('content', whiteLabel.brand_identity.tagline);
      }
    }
    
    // Update Apple mobile web app title
    const appleMobileTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleMobileTitle && (whiteLabel.pwa_config?.short_name || whiteLabel.brand_identity?.company_name)) {
      appleMobileTitle.setAttribute('content', whiteLabel.pwa_config?.short_name || whiteLabel.brand_identity?.company_name || 'KisanShakti');
    }
  },

  clearError: () => set({ error: null }),

  listenForTenantChanges: () => {
    const { tenant } = get();
    const whiteLabelService = WhiteLabelService.getInstance();
    
    if (!tenant?.id) {
      console.log('[TenantStore] No tenant ID, skipping realtime listeners');
      return;
    }
    
    console.log('[TenantStore] Setting up realtime listeners for tenant:', tenant.id);
    
    // Listen for tenant table changes (specific to current tenant)
    const tenantsChannel = supabase
      .channel(`tenant-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tenants',
          filter: `id=eq.${tenant.id}`
        },
        async (payload) => {
          console.log('[TenantStore] Tenant updated:', payload);
          
          // Show toast notification
          if (typeof window !== 'undefined') {
            const { toast } = await import('@/hooks/use-toast');
            toast({
              title: 'Configuration updated',
              description: 'Your app theme has been refreshed',
            });
          }
          
          // Force refresh and re-fetch tenant
          await whiteLabelService.forceRefresh(tenant.id);
          get().fetchTenant();
        }
      )
      .subscribe();
    
    // Listen for white_label_configs table changes (specific to current tenant)
    const whiteLabelChannel = supabase
      .channel(`white-label-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'white_label_configs',
          filter: `tenant_id=eq.${tenant.id}`
        },
        async (payload) => {
          console.log('[TenantStore] White-label config updated:', payload);
          
          // Clear cache and force refresh
          whiteLabelService.clearCache();
          await whiteLabelService.forceRefresh(tenant.id);
          
          // Show toast notification
          if (typeof window !== 'undefined') {
            const { toast } = await import('@/hooks/use-toast');
            toast({
              title: 'Theme updated!',
              description: 'New branding has been applied instantly',
              duration: 3000,
            });
          }
          
          // Re-fetch tenant to apply new config
          get().fetchTenant();
          
          // Update manifest immediately
          updateManifestLink();
        }
      )
      .subscribe();

    // Listen for theme updates from auto-refresh
    if (typeof window !== 'undefined') {
      window.addEventListener('themeUpdated', async (event: Event) => {
        console.log('[TenantStore] Theme auto-refreshed, applying new configuration');
        const customEvent = event as CustomEvent;
        const config = customEvent.detail;
        if (config && config.whiteLabelConfig) {
          get().applyWhiteLabelTheme(config.whiteLabelConfig);
        }
      });
    }
    
    console.log('[TenantStore] Realtime listeners setup complete');
  },
}));

/**
 * Update manifest link to use dynamic edge function
 */
function updateManifestLink() {
  const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
  if (!manifestLink) return;
  
  const domain = window.location.hostname;
  const manifestUrl = `https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/generate-manifest?domain=${encodeURIComponent(domain)}`;
  
  // Only update if URL changed
  if (manifestLink.href !== manifestUrl) {
    manifestLink.href = manifestUrl;
    console.log('[TenantStore] Updated manifest URL:', manifestUrl);
  }
}

// Helper function to convert RGB to HSL
function rgbToHSL(r: number, g: number, b: number): string {
  // Normalize RGB values to 0-1 range
  r = r / 255;
  g = g / 255;
  b = b / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  // Return in Tailwind CSS format (space-separated, with % for s and l)
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Helper function to convert hex to HSL (Tailwind CSS format)
function hexToHSL(hex: string): string {
  // Remove the # if present
  hex = hex.replace('#', '');
  
  // Handle 3-digit hex
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  
  // Convert hex to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  // Return in Tailwind CSS format (space-separated, with % for s and l)
  // Format: "hue saturation% lightness%"
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}