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
    }
    
    // Apply PWA manifest updates
    if (whiteLabel.pwa_config) {
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (manifestLink) {
        // Update manifest data dynamically
        const manifestData = {
          name: whiteLabel.pwa_config.app_name || whiteLabel.brand_identity?.company_name || 'KisanShakti Ai',
          short_name: whiteLabel.pwa_config.short_name || 'KS Ai',
          theme_color: whiteLabel.pwa_config.theme_color || '#3b82f6',
          background_color: whiteLabel.pwa_config.background_color || '#ffffff',
          display: whiteLabel.pwa_config.display || 'standalone',
          orientation: whiteLabel.pwa_config.orientation || 'portrait',
          start_url: whiteLabel.pwa_config.start_url || '/',
          icons: whiteLabel.pwa_config.icons || []
        };
        
        // Create a blob URL for the manifest
        const manifestBlob = new Blob([JSON.stringify(manifestData)], { type: 'application/json' });
        const manifestUrl = URL.createObjectURL(manifestBlob);
        manifestLink.setAttribute('href', manifestUrl);
      }
    }
    
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
}));

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