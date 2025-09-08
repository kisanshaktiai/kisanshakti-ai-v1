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
      
      // First try to fetch tenant with white_label_configs by domain
      const { data: tenantData, error } = await supabase
        .from('tenants')
        .select(`
          *,
          white_label_configs (*)
        `)
        .or(`custom_domain.eq.${domain},subdomain.eq.${domain.split('.')[0]}`)
        .single();

      if (error || !tenantData) {
        // If no tenant found or error, use default tenant
        const { data: defaultTenant } = await supabase
          .from('tenants')
          .select(`
            *,
            white_label_configs (*)
          `)
          .eq('is_default', true)
          .single();

        if (defaultTenant) {
          const settingsObj = typeof defaultTenant.settings === 'object' && defaultTenant.settings !== null 
            ? defaultTenant.settings as any 
            : {};
          
          // Get white label config if exists
          const whiteLabelData = Array.isArray(defaultTenant.white_label_configs) 
            ? defaultTenant.white_label_configs[0] 
            : defaultTenant.white_label_configs;
          
          const tenant: Tenant = {
            id: defaultTenant.id,
            name: whiteLabelData?.brand_identity?.company_name || defaultTenant.name,
            domain: domain,
            whiteLabel: whiteLabelData || {},
            settings: {
              languages: whiteLabelData?.app_customization?.language_settings?.supported || 
                        settingsObj.languages || 
                        ['en', 'hi', 'pa', 'mr', 'ta'],
              defaultLanguage: whiteLabelData?.app_customization?.language_settings?.default || 
                              settingsObj.defaultLanguage || 
                              'hi',
              features: settingsObj.features || ['weather', 'market', 'advisory', 'schemes'],
            },
          };
          set({ tenant, isLoading: false });
          
          // Apply white label theme
          if (whiteLabelData) {
            get().applyWhiteLabelTheme(whiteLabelData);
          }
        } else {
          // No tenant found - show error
          set({
            tenant: null,
            isLoading: false,
            error: 'No tenant configuration found. Please contact administrator.'
          });
        }
      } else {
        // Transform database tenant to our Tenant interface
        const settingsObj = typeof tenantData.settings === 'object' && tenantData.settings !== null 
          ? tenantData.settings as any 
          : {};
        
        // Get white label config if exists
        const whiteLabelData = Array.isArray(tenantData.white_label_configs) 
          ? tenantData.white_label_configs[0] 
          : tenantData.white_label_configs;
          
        const tenant: Tenant = {
          id: tenantData.id,
          name: whiteLabelData?.brand_identity?.company_name || tenantData.name,
          domain: domain,
          whiteLabel: whiteLabelData || {},
          settings: {
            languages: whiteLabelData?.app_customization?.language_settings?.supported || 
                      settingsObj.languages || 
                      ['en', 'hi', 'pa', 'mr', 'ta'],
            defaultLanguage: whiteLabelData?.app_customization?.language_settings?.default || 
                            settingsObj.defaultLanguage || 
                            'hi',
            features: settingsObj.features || ['weather', 'market', 'advisory', 'schemes'],
          },
        };

        set({ tenant, isLoading: false });

        // Apply white label theme
        if (whiteLabelData) {
          get().applyWhiteLabelTheme(whiteLabelData);
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