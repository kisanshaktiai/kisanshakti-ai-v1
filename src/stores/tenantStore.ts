import { create } from 'zustand';
import { supabase } from '@/utils/supabase';

interface Theme {
  primaryColor?: string;
  secondaryColor?: string;
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
      
      if (!supabase) {
        // Set default tenant for development
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
            },
          },
          isLoading: false,
        });
        return;
      }

      // Fetch tenant by domain from Supabase
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('domain', domain)
        .single();

      if (error) throw error;

      set({ 
        tenant: data,
        isLoading: false,
      });

      // Apply theme
      if (data?.theme) {
        get().setTheme(data.theme);
      }
    } catch (error: any) {
      set({ 
        error: error.message || 'Failed to fetch tenant',
        isLoading: false,
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