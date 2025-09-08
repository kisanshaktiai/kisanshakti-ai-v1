import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

interface Theme {
  primaryColor?: string;
  secondaryColor?: string;
  primaryGradient?: string;
  logo?: string;
  fonts?: {
    heading?: string;
    body?: string;
  };
}

interface Tenant {
  id: string;
  name: string;
  domain: string;
  theme: Theme;
  settings: {
    languages: string[];
    defaultLanguage: string;
    features: string[];
    logo?: string;
    tagline?: string;
    version?: string;
    theme?: Theme;
  };
}

interface TenantState {
  tenant: Tenant | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchTenant: () => Promise<void>;
  setTheme: (theme: Theme) => void;
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
      
      // First try to fetch tenant by domain from Supabase
      const { data: tenantData, error } = await supabase
        .from('tenants')
        .select('*')
        .or(`custom_domain.eq.${domain},subdomain.eq.${domain.split('.')[0]}`)
        .single();

      if (error || !tenantData) {
        // If no tenant found or error, use default tenant
        const { data: defaultTenant } = await supabase
          .from('tenants')
          .select('*')
          .eq('is_default', true)
          .single();

        if (defaultTenant) {
          const settingsObj = typeof defaultTenant.settings === 'object' && defaultTenant.settings !== null 
            ? defaultTenant.settings as any 
            : {};
          
          const tenant: Tenant = {
            id: defaultTenant.id,
            name: defaultTenant.name,
            domain: domain,
            theme: {},
            settings: {
              languages: settingsObj.languages || ['en', 'hi', 'pa', 'mr', 'ta'],
              defaultLanguage: settingsObj.defaultLanguage || 'hi',
              features: settingsObj.features || ['weather', 'market', 'advisory', 'schemes'],
              logo: settingsObj.logo,
              tagline: settingsObj.tagline || 'Empowering Farmers with Technology',
              version: settingsObj.version || '1.0.0',
              theme: settingsObj.theme || {}
            },
          };
          set({ tenant, isLoading: false });
        } else {
          // Fallback to hardcoded default
          set({
            tenant: {
              id: 'default',
              name: 'KisanShakti',
              domain: domain,
              theme: {},
              settings: {
                languages: ['en', 'hi', 'pa', 'mr', 'ta'],
                defaultLanguage: 'hi',
                features: ['weather', 'market', 'advisory', 'schemes'],
                tagline: 'Empowering Farmers with Technology',
                version: '1.0.0',
                theme: {}
              },
            },
            isLoading: false,
          });
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
          theme: settingsObj.theme || {},
          settings: {
            languages: settingsObj.languages || ['en', 'hi', 'pa', 'mr', 'ta'],
            defaultLanguage: settingsObj.defaultLanguage || 'hi',
            features: settingsObj.features || ['weather', 'market', 'advisory', 'schemes'],
            logo: settingsObj.logo,
            tagline: settingsObj.tagline || 'Empowering Farmers with Technology',
            version: settingsObj.version || '1.0.0',
            theme: settingsObj.theme || {}
          },
        };

        set({ tenant, isLoading: false });

        // Apply theme
        if (tenant.settings.theme) {
          get().setTheme(tenant.settings.theme);
        }
      }
    } catch (error: any) {
      console.error('Error fetching tenant:', error);
      // Use fallback tenant on error
      set({
        tenant: {
          id: 'default',
          name: 'KisanShakti',
          domain: window.location.hostname,
          theme: {},
          settings: {
            languages: ['en', 'hi', 'pa', 'mr', 'ta'],
            defaultLanguage: 'hi',
            features: ['weather', 'market', 'advisory', 'schemes'],
            tagline: 'Empowering Farmers with Technology',
            version: '1.0.0',
            theme: {}
          },
        },
        isLoading: false,
        error: error.message || 'Failed to fetch tenant',
      });
    }
  },

  setTheme: (theme) => {
    // Apply custom theme to CSS variables
    const root = document.documentElement;
    
    if (theme.primaryColor) {
      root.style.setProperty('--primary', theme.primaryColor);
    }
    if (theme.secondaryColor) {
      root.style.setProperty('--secondary', theme.secondaryColor);
    }
  },

  clearError: () => set({ error: null }),
}));