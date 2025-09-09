import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

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
}

interface AppCustomization {
  theme_mode?: 'light' | 'dark' | 'system';
  navigation_style?: string;
  layout_style?: string;
  component_styles?: any;
  custom_css?: string;
  animations_enabled?: boolean;
  language_settings?: {
    default?: string;
    supported?: string[];
  };
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
    tablet?: string;
    desktop?: string;
    loading_text?: string;
    loading_color?: string;
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
        // In production, try exact domain match first
        const { data: exactMatch, error: exactError } = await supabase
          .from('tenants')
          .select('*')
          .eq('custom_domain', domain)
          .maybeSingle();
        
        if (exactMatch) {
          tenantData = exactMatch;
        } else {
          // Try subdomain match
          const subdomain = domain.split('.')[0];
          const { data: subdomainMatch, error: subdomainError } = await supabase
            .from('tenants')
            .select('*')
            .eq('subdomain', subdomain)
            .maybeSingle();
          
          tenantData = subdomainMatch;
          error = subdomainError;
        }
      }

      // Fetch white label config if tenant found
      if (tenantData?.id) {
        localStorage.setItem('tenantId', tenantData.id);
        
        const { data: whiteLabel } = await supabase
          .from('white_label_configs')
          .select('*')
          .eq('tenant_id', tenantData.id)
          .maybeSingle();
        
        whiteLabelData = whiteLabel;
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
          const { data: whiteLabel } = await supabase
            .from('white_label_configs')
            .select('*')
            .eq('tenant_id', defaultTenant.id)
            .maybeSingle();
          
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
            features: settingsObj.features || ['weather', 'market', 'advisory', 'schemes'],
          },
        };

        set({ tenant, isLoading: false });
        
        // Apply white label theme if available
        if (whiteLabelData) {
          get().applyWhiteLabelTheme(tenant.whiteLabel!);
        }
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
    // Apply custom theme to CSS variables
    const root = document.documentElement;
    const brandIdentity = whiteLabel.brand_identity;
    
    if (brandIdentity?.primary_color) {
      // Convert hex to HSL if needed
      const hslColor = brandIdentity.primary_color.startsWith('#') 
        ? hexToHSL(brandIdentity.primary_color)
        : brandIdentity.primary_color;
      root.style.setProperty('--primary', hslColor);
    }
    
    if (brandIdentity?.secondary_color) {
      const hslColor = brandIdentity.secondary_color.startsWith('#')
        ? hexToHSL(brandIdentity.secondary_color)
        : brandIdentity.secondary_color;
      root.style.setProperty('--secondary', hslColor);
    }
    
    if (brandIdentity?.accent_color) {
      const hslColor = brandIdentity.accent_color.startsWith('#')
        ? hexToHSL(brandIdentity.accent_color)
        : brandIdentity.accent_color;
      root.style.setProperty('--accent', hslColor);
    }
    
    if (brandIdentity?.font_family) {
      root.style.setProperty('--font-sans', brandIdentity.font_family);
    }
    
    // Apply PWA config if available
    if (whiteLabel.pwa_config?.theme_color) {
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', whiteLabel.pwa_config.theme_color);
      }
    }
    
    // Apply custom CSS if available
    if (whiteLabel.app_customization?.custom_css) {
      const styleElement = document.createElement('style');
      styleElement.textContent = whiteLabel.app_customization.custom_css;
      document.head.appendChild(styleElement);
    }
  },

  clearError: () => set({ error: null }),
}));

// Helper function to convert hex to HSL
function hexToHSL(hex: string): string {
  // Remove the # if present
  hex = hex.replace('#', '');
  
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
  
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}