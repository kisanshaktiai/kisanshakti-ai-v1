import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { localDB } from '@/services/localDB';
import { tenantIsolationService } from '@/services/tenantIsolationService';
import { resetTenantStores } from '@/utils/resetStores';
import { getEnvironment, logEnvironmentInfo } from '@/utils/environment';
import { getSupabaseFunctionUrl } from '@/config/supabase';

// Extend Window interface
declare global {
  interface Window {
    __TENANT_LOADED__?: boolean;
    __TENANT_BRANDING__?: any;
  }
}

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
  support?: Record<string, string>;
  typography?: {
    font_family?: string;
    font_size_base?: string | number;
    font_weight_regular?: string | number;
    font_weight_medium?: string | number;
    font_weight_bold?: string | number;
  };
  navigation?: Record<string, string>;
  charts?: Record<string, string>;
  maps?: Record<string, string>;
  weather?: Record<string, string>;
  gradients?: Record<string, string>;
  border_radius?: Record<string, string | number>;
  shadows?: Record<string, string>;
  spacing?: Record<string, string | number>;
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

export interface SplashScreenConfig {
  enabled?: boolean;
  active_animations?: number[]; // [1,2,3,4,5] - which animations to show
  rotation_mode?: 'sequential' | 'random';
  custom_message?: string;
  show_logo?: boolean;
  animation_duration?: number;
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
  splashScreens?: SplashScreenConfig;
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
  splashScreens: SplashScreenConfig | null;
  features: string[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  clearCache: () => void;
  lastUpdated: Date | null;
}

// ============= Context =============

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

type ThemeSource = Record<string, any>;

const firstThemeValue = (source: ThemeSource, keys: string[]) => {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const setThemeAlias = (
  target: ThemeSource,
  group: string,
  key: string,
  source: ThemeSource,
  aliases: string[]
) => {
  const value = firstThemeValue(source, aliases);
  if (value === undefined) return;
  const existing = target[group];
  target[group] = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  if (target[group][key] === undefined || target[group][key] === null || target[group][key] === '') {
    target[group][key] = value;
  }
};

/**
 * Normalize tenant portal theme payloads before applying them. Some tenants
 * store nested semantic groups, while older portal saves use flat keys like
 * `primary_color_hex`, `background_color`, and `surface_color`.
 */
export function normalizeThemeConfig(theme?: ThemeSource | null): ThemeConfig | undefined {
  if (!theme) return undefined;
  const out: ThemeSource = { ...theme };

  setThemeAlias(out, 'core', 'primary', theme, ['primary', 'primary_color', 'primary_color_hex', 'brand_primary_color']);
  setThemeAlias(out, 'core', 'primary_foreground', theme, ['primary_foreground', 'primary_foreground_color', 'on_primary', 'on_primary_color']);
  setThemeAlias(out, 'core', 'secondary', theme, ['secondary', 'secondary_color', 'secondary_color_hex', 'brand_secondary_color']);
  setThemeAlias(out, 'core', 'secondary_foreground', theme, ['secondary_foreground', 'secondary_foreground_color', 'on_secondary', 'on_secondary_color']);
  setThemeAlias(out, 'core', 'accent', theme, ['accent', 'accent_color', 'accent_color_hex', 'brand_accent_color']);
  setThemeAlias(out, 'core', 'accent_foreground', theme, ['accent_foreground', 'accent_foreground_color', 'on_accent', 'on_accent_color']);
  setThemeAlias(out, 'core', 'ring', theme, ['ring', 'ring_color', 'focus_color']);

  setThemeAlias(out, 'neutral', 'background', theme, ['background', 'background_color', 'background_color_hex', 'app_background_color']);
  setThemeAlias(out, 'neutral', 'on_background', theme, ['on_background', 'on_background_color', 'foreground', 'foreground_color', 'text_color', 'text_color_hex']);
  setThemeAlias(out, 'neutral', 'surface', theme, ['surface', 'surface_color', 'surface_color_hex', 'card', 'card_color', 'popover', 'panel_color']);
  setThemeAlias(out, 'neutral', 'on_surface', theme, ['on_surface', 'on_surface_color', 'card_foreground', 'card_foreground_color', 'surface_text_color', 'text_color']);
  setThemeAlias(out, 'neutral', 'border', theme, ['border', 'border_color', 'border_color_hex', 'input', 'input_color', 'divider_color']);

  setThemeAlias(out, 'status', 'success', theme, ['success', 'success_color', 'success_color_hex']);
  setThemeAlias(out, 'status', 'warning', theme, ['warning', 'warning_color', 'warning_color_hex']);
  setThemeAlias(out, 'status', 'error', theme, ['error', 'error_color', 'error_color_hex', 'destructive', 'destructive_color']);
  setThemeAlias(out, 'status', 'info', theme, ['info', 'info_color', 'info_color_hex']);

  setThemeAlias(out, 'navigation', 'nav_background', theme, ['nav_background', 'nav_background_color', 'bottom_nav_background', 'bottom_nav_background_color', 'navigation_background_color']);
  setThemeAlias(out, 'navigation', 'nav_active', theme, ['nav_active', 'nav_active_color', 'bottom_nav_active', 'bottom_nav_active_color', 'navigation_active_color']);
  setThemeAlias(out, 'navigation', 'nav_inactive', theme, ['nav_inactive', 'nav_inactive_color', 'bottom_nav_inactive', 'bottom_nav_inactive_color', 'navigation_inactive_color']);
  setThemeAlias(out, 'navigation', 'nav_border', theme, ['nav_border', 'nav_border_color', 'bottom_nav_border', 'bottom_nav_border_color', 'navigation_border_color']);

  setThemeAlias(out, 'support', 'disabled', theme, ['disabled', 'disabled_color', 'disabled_text_color']);
  setThemeAlias(out, 'support', 'overlay', theme, ['overlay', 'overlay_color']);

  setThemeAlias(out, 'typography', 'font_family', theme, ['font_family', 'fontFamily']);
  setThemeAlias(out, 'typography', 'font_size_base', theme, ['font_size_base', 'fontSizeBase', 'base_font_size']);
  setThemeAlias(out, 'typography', 'font_weight_regular', theme, ['font_weight_regular', 'regular_font_weight']);
  setThemeAlias(out, 'typography', 'font_weight_medium', theme, ['font_weight_medium', 'medium_font_weight']);
  setThemeAlias(out, 'typography', 'font_weight_bold', theme, ['font_weight_bold', 'bold_font_weight']);

  return out as ThemeConfig;
}

/**
 * Deep-merge the two theme JSONB groups stored in white_label_configs.
 * - `theme_colors` carries: core, navigation, charts, maps, weather, gradients, dark_mode.
 * - `mobile_theme`  carries: core, neutral, status, support, typography, border_radius, shadows, spacing.
 * Both share `core` — mobile_theme wins so the partner's preset is authoritative.
 * Without this merge, picking one column drops half the namespaces from the app.
 */
export function mergeThemeGroups(
  themeColors?: Record<string, any> | null,
  mobileTheme?: Record<string, any> | null
): ThemeConfig | undefined {
  const normalizedThemeColors = normalizeThemeConfig(themeColors);
  const normalizedMobileTheme = normalizeThemeConfig(mobileTheme);
  if (!normalizedThemeColors && !normalizedMobileTheme) return undefined;
  const out: Record<string, any> = {};
  const keys = new Set([
    ...Object.keys(normalizedThemeColors || {}),
    ...Object.keys(normalizedMobileTheme || {}),
  ]);
  for (const k of keys) {
    const a = (normalizedThemeColors as any)?.[k];
    const b = (normalizedMobileTheme as any)?.[k];
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      out[k] = { ...a, ...b };
    } else {
      out[k] = b ?? a;
    }
  }
  return out as ThemeConfig;
}


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

  // Helper function to load tenant config from offline cache
  const loadOfflineConfig = useCallback(async (domain: string): Promise<TenantConfig | null> => {
    try {
      // Try localStorage cache first (faster)
      const cachedTenant = localStorage.getItem('tenant_config_cache');
      if (cachedTenant) {
        const parsed = JSON.parse(cachedTenant);
        // In offline mode, accept cache up to 24 hours old
        if (Date.now() - parsed.timestamp < 86400000) {
          console.log('📦 [TenantProvider] Found offline config in localStorage');
          return parsed.data;
        }
      }

      // Try IndexedDB cache
      const storedTenantId = localStorage.getItem('tenantId');
      if (storedTenantId) {
        const cachedConfig = await localDB.getTenantConfig(storedTenantId);
        if (cachedConfig?.tenant_data) {
          console.log('📦 [TenantProvider] Found offline config in IndexedDB');
          return {
            id: cachedConfig.tenant_data.id,
            name: cachedConfig.tenant_data.name,
            domain: cachedConfig.tenant_data.domain || domain,
            branding: (cachedConfig.white_label_config?.brand_identity as BrandingConfig) || {
              company_name: cachedConfig.tenant_data.name,
            },
            theme: mergeThemeGroups(cachedConfig.white_label_config?.theme_colors as any, cachedConfig.white_label_config?.mobile_theme as any),
            pwa: cachedConfig.white_label_config?.pwa_config as PWAConfig,
            features: [],
            settings: {
              languages: ['en', 'hi'],
              defaultLanguage: 'hi',
            },
          };
        }
      }

      return null;
    } catch (e) {
      console.error('❌ [TenantProvider] Failed to load offline config:', e);
      return null;
    }
  }, []);

  const buildConfigFromWhiteLabelPayload = useCallback((payload: any, domain: string): TenantConfig | null => {
    const tenantData = payload?.tenant;
    if (!tenantData?.id) return null;

    const whiteLabelConfig = payload?.whiteLabelConfig || {};
    const brandIdentity = whiteLabelConfig.brand_identity || {};
    const tenantSettings = tenantData.settings || {};

    return {
      id: tenantData.id,
      name: tenantData.name || brandIdentity.company_name || brandIdentity.app_name || 'Tenant',
      slug: tenantData.slug || undefined,
      domain,
      subdomain: tenantData.subdomain || undefined,
      custom_domain: tenantData.custom_domain || undefined,
      status: tenantData.status || 'active',
      branding: {
        company_name: brandIdentity.company_name || brandIdentity.app_name || tenantData.name,
        tagline: brandIdentity.tagline,
        logo_url: brandIdentity.logo_url,
        favicon_url: brandIdentity.favicon_url,
        primary_color: brandIdentity.primary_color,
        secondary_color: brandIdentity.secondary_color,
        accent_color: brandIdentity.accent_color,
        background_color: brandIdentity.background_color,
        text_color: brandIdentity.text_color,
        font_family: brandIdentity.font_family,
        description: brandIdentity.description,
      },
      theme: mergeThemeGroups(whiteLabelConfig.theme_colors as any, whiteLabelConfig.mobile_theme as any),
      pwa: whiteLabelConfig.pwa_config as PWAConfig,
      splashScreens: whiteLabelConfig.splash_screens as SplashScreenConfig,
      features: payload?.features || tenantSettings.features || [],
      settings: {
        languages: payload?.languages || tenantSettings.languages || ['en', 'hi'],
        defaultLanguage: tenantSettings.defaultLanguage || 'hi',
        timezone: tenantSettings.timezone || 'Asia/Kolkata',
        currency: tenantSettings.currency || 'INR',
      },
    };
  }, []);

  // Track which CSS variables we've set, so we can clear them when switching tenants.
  const appliedVarsRef = useRef<Set<string>>(new Set());

  const applyThemeToDOM = useCallback((branding: BrandingConfig, theme?: ThemeConfig) => {
    const root = document.documentElement;

    // --- Color helpers ----------------------------------------------------
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

    /** Returns an HSL triplet ("H S% L%") for any color string. Pass-through if already triplet. */
    const ensureHSL = (color: string): string => {
      if (!color) return '';
      const trimmed = String(color).trim();
      if (trimmed.includes('%')) return trimmed;            // already "H S% L%" or "hsl(...)"
      if (trimmed.startsWith('#')) return hexToHSL(trimmed);
      // hsl(...) or rgb(...) — leave as-is; CSS engine handles it (won't compose with hsl(var(--x)))
      return trimmed;
    };

    /** Luminance-aware foreground (#fff or near-black) for a hex/HSL color. */
    const contrastForegroundHSL = (color: string): string => {
      const triplet = ensureHSL(color);
      const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(triplet);
      const L = m ? parseFloat(m[3]) : 50;
      return L >= 60 ? '0 0% 10%' : '0 0% 100%';
    };

    /** Track + set a CSS variable so we can later clear stale tenant overrides. */
    const setVar = (name: string, value: string) => {
      if (!value) return;
      root.style.setProperty(name, value);
      appliedVarsRef.current.add(name);
    };

    // --- Reset previously-applied tenant vars (so a sparser tenant theme
    //     doesn't inherit the previous tenant's overrides). ---------------
    appliedVarsRef.current.forEach((name) => root.style.removeProperty(name));
    appliedVarsRef.current.clear();

    console.log('🎨 [TenantProvider] Applying theme to DOM', {
      hasTheme: !!theme,
      themeNamespaces: theme ? Object.keys(theme) : [],
      branding_primary: branding.primary_color,
    });

    // ---- core (primary, secondary, accent, foregrounds, muted, card…) --
    if (theme?.core) {
      Object.entries(theme.core).forEach(([key, value]) => {
        if (!value) return;
        setVar(`--${key.replace(/_/g, '-')}`, ensureHSL(value));
      });
    }

    // ---- neutral (background, surface→card/popover, border→border/input)
    if (theme?.neutral) {
      const n = theme.neutral;
      if (n.background) setVar('--background', ensureHSL(n.background));
      if (n.on_background) setVar('--foreground', ensureHSL(n.on_background));
      if (n.surface) {
        setVar('--card', ensureHSL(n.surface));
        setVar('--popover', ensureHSL(n.surface));
      }
      if (n.on_surface) {
        setVar('--card-foreground', ensureHSL(n.on_surface));
        setVar('--popover-foreground', ensureHSL(n.on_surface));
      }
      if (n.border) {
        setVar('--border', ensureHSL(n.border));
        setVar('--input', ensureHSL(n.border));
      }
    }

    // ---- status (success/warning/error→destructive/info) ----------------
    if (theme?.status) {
      const s = theme.status;
      if (s.success) {
        const v = ensureHSL(s.success);
        setVar('--success', v);
        setVar('--success-foreground', contrastForegroundHSL(s.success));
        setVar('--success-soft', `${v.replace(/(\d+)%$/, '92%')}`);
      }
      if (s.warning) {
        const v = ensureHSL(s.warning);
        setVar('--warning', v);
        setVar('--warning-foreground', contrastForegroundHSL(s.warning));
        setVar('--warning-soft', `${v.replace(/(\d+)%$/, '92%')}`);
      }
      if (s.error) {
        const v = ensureHSL(s.error);
        setVar('--destructive', v);
        setVar('--destructive-foreground', contrastForegroundHSL(s.error));
        setVar('--destructive-soft', `${v.replace(/(\d+)%$/, '94%')}`);
      }
      if (s.info) {
        const v = ensureHSL(s.info);
        setVar('--info', v);
        setVar('--info-foreground', contrastForegroundHSL(s.info));
        setVar('--info-soft', `${v.replace(/(\d+)%$/, '94%')}`);
      }
    }

    // ---- support (disabled, overlay) -----------------------------------
    if (theme?.support) {
      if (theme.support.disabled) setVar('--muted-foreground', ensureHSL(theme.support.disabled));
      if (theme.support.overlay)  setVar('--overlay-dark',     ensureHSL(theme.support.overlay));
    }

    // ---- navigation -----------------------------------------------------
    if (theme?.navigation) {
      const map: Record<string, string> = {
        nav_active: '--nav-active',
        nav_inactive: '--nav-inactive',
        nav_background: '--nav-background',
        nav_border: '--nav-border',
      };
      Object.entries(theme.navigation).forEach(([k, v]) => {
        if (map[k] && v) setVar(map[k], ensureHSL(v));
      });
    }

    // ---- charts (chart_1..5 → --chart-1..5) ----------------------------
    if (theme?.charts) {
      Object.entries(theme.charts).forEach(([k, v]) => {
        if (v) setVar(`--${k.replace(/_/g, '-')}`, ensureHSL(v));
      });
    }

    // ---- maps -----------------------------------------------------------
    if (theme?.maps) {
      const map: Record<string, string> = {
        marker_color: '--marker-color',
        polygon_fill: '--polygon-fill',
        polygon_stroke: '--polygon-stroke',
        tracking_fill: '--tracking-fill',
        tracking_stroke: '--tracking-stroke',
      };
      Object.entries(theme.maps).forEach(([k, v]) => {
        if (map[k] && v) setVar(map[k], ensureHSL(v));
      });
    }

    // ---- weather --------------------------------------------------------
    if (theme?.weather) {
      Object.entries(theme.weather).forEach(([k, v]) => {
        if (v) setVar(`--weather-${k.replace(/_/g, '-')}`, ensureHSL(v));
      });
    }

    // ---- gradients (full CSS gradient strings) --------------------------
    if (theme?.gradients) {
      Object.entries(theme.gradients).forEach(([k, v]) => {
        if (v) setVar(`--gradient-${k.replace(/_/g, '-')}`, String(v));
      });
    }

    // ---- border radius --------------------------------------------------
    if (theme?.border_radius) {
      const br = theme.border_radius;
      const toRem = (n: string | number) => {
        const num = typeof n === 'number' ? n : parseFloat(String(n));
        if (Number.isNaN(num)) return String(n);
        if (String(n).endsWith('px') || String(n).endsWith('rem')) return String(n);
        return `${num / 16}rem`;
      };
      if (br.sm)   setVar('--radius-sm',   toRem(br.sm));
      if (br.md) { setVar('--radius',      toRem(br.md)); setVar('--radius-md', toRem(br.md)); }
      if (br.lg)   setVar('--radius-lg',   toRem(br.lg));
      if (br.full) setVar('--radius-full', String(br.full).includes('px') || String(br.full).includes('rem') ? String(br.full) : `${br.full}px`);
    }

    // ---- shadows --------------------------------------------------------
    if (theme?.shadows) {
      Object.entries(theme.shadows).forEach(([k, v]) => {
        if (v) setVar(`--shadow-${k}`, String(v));
      });
    }

    // ---- typography -----------------------------------------------------
    if (theme?.typography?.font_family) {
      setVar('--font-sans', theme.typography.font_family);
      document.body.style.fontFamily = theme.typography.font_family;
    }
    if (theme?.typography?.font_size_base) {
      const v = typeof theme.typography.font_size_base === 'number'
        ? `${theme.typography.font_size_base}px`
        : String(theme.typography.font_size_base);
      setVar('--font-size-base', v);
    }
    if (theme?.typography?.font_weight_regular) setVar('--font-weight-regular', String(theme.typography.font_weight_regular));
    if (theme?.typography?.font_weight_medium)  setVar('--font-weight-medium',  String(theme.typography.font_weight_medium));
    if (theme?.typography?.font_weight_bold)    setVar('--font-weight-bold',    String(theme.typography.font_weight_bold));

    // ---- dark-mode tokens (injected into a <style> scoped to .dark) ----
    if (theme?.dark_mode?.colors) {
      const lines: string[] = [];
      Object.entries(theme.dark_mode.colors).forEach(([k, v]) => {
        if (v) lines.push(`  --${k.replace(/_/g, '-')}: ${ensureHSL(v)};`);
      });
      let styleEl = document.getElementById('tenant-dark-tokens') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'tenant-dark-tokens';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `.dark {\n${lines.join('\n')}\n}`;
    } else {
      // Remove stale dark overrides from a previous tenant
      const styleEl = document.getElementById('tenant-dark-tokens');
      if (styleEl) styleEl.remove();
    }

    // ---- Branding-color fallback (only fill what theme didn't cover) ---
    if (branding.primary_color && !theme?.core?.primary) {
      const primaryHSL = ensureHSL(branding.primary_color);
      setVar('--primary', primaryHSL);
      setVar('--primary-foreground', contrastForegroundHSL(branding.primary_color));
      localStorage.setItem('tenant_primary_color', `hsl(${primaryHSL})`);
    } else if (branding.primary_color) {
      // Still cache for the loader/PWA
      localStorage.setItem('tenant_primary_color', `hsl(${ensureHSL(branding.primary_color)})`);
    }
    if (branding.secondary_color && !theme?.core?.secondary) {
      setVar('--secondary', ensureHSL(branding.secondary_color));
      setVar('--secondary-foreground', contrastForegroundHSL(branding.secondary_color));
    }
    if (branding.accent_color && !theme?.core?.accent) {
      setVar('--accent', ensureHSL(branding.accent_color));
      setVar('--accent-foreground', contrastForegroundHSL(branding.accent_color));
    }
    if (branding.background_color && !theme?.neutral?.background) {
      setVar('--background', ensureHSL(branding.background_color));
    }
    if (branding.text_color && !theme?.neutral?.on_background) {
      setVar('--foreground', ensureHSL(branding.text_color));
    }
    if (branding.font_family && !theme?.typography?.font_family) {
      setVar('--font-sans', branding.font_family);
      document.body.style.fontFamily = branding.font_family;
    }

    // ---- Favicon + title -----------------------------------------------
    if (branding.favicon_url) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) link.href = branding.favicon_url;
    }
    if (branding.company_name) document.title = branding.company_name;

    console.log('✅ [TenantProvider] Theme applied (', appliedVarsRef.current.size, 'tokens )');
  }, []);


  const fetchTenantConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const domain = getCurrentDomain();
      const env = getEnvironment();
      const isOnline = navigator.onLine;
      
      // PERFORMANCE FIX: Reduce verbose logging in production
      if (env.isDevelopment) {
        logEnvironmentInfo();
        console.log('🔍 [TenantProvider] Fetching tenant config...');
        console.log('🌐 [TenantProvider] Current domain:', domain);
      }

      // OFFLINE-FIRST: If offline, immediately try cache without network request
      if (!isOnline) {
        console.log('📴 [TenantProvider] Device is OFFLINE - using cached config');
        const offlineConfig = await loadOfflineConfig(domain);
        if (offlineConfig) {
          setTenant(offlineConfig);
          tenantIsolationService.setTenantContext(offlineConfig.id, domain);
          applyThemeToDOM(offlineConfig.branding, offlineConfig.theme);
          setLastUpdated(new Date());
          window.__TENANT_LOADED__ = true;
          window.__TENANT_BRANDING__ = offlineConfig.branding;
          console.log('✅ [TenantProvider] Loaded tenant from offline cache:', offlineConfig.name);
          return;
        }
        console.warn('⚠️ [TenantProvider] No offline cache found, will show fallback');
      }

      // Check for new deploy using build hash (only when online)
      if (isOnline) {
        const BUILD_HASH = import.meta.env.VITE_BUILD_HASH || Date.now().toString();
        const storedHash = localStorage.getItem('build_hash');
        
        // Clear cache if build hash changed (new deploy detected)
        if (storedHash && storedHash !== BUILD_HASH) {
          console.log('🔄 [TenantProvider] New deploy detected, clearing caches...', {
            oldHash: storedHash.substring(0, 10),
            newHash: BUILD_HASH.substring(0, 10)
          });
          localStorage.removeItem('tenant_config_cache');
          localStorage.removeItem('white_label_config');
          localStorage.removeItem('tenant_primary_color');
          localStorage.setItem('build_hash', BUILD_HASH);
          
          // Signal service worker to clear caches
          if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' });
            console.log('📡 [TenantProvider] Sent cache clear signal to service worker');
          }
        } else if (!storedHash) {
          // First load - store build hash
          localStorage.setItem('build_hash', BUILD_HASH);
          console.log('🔖 [TenantProvider] Baseline build hash stored:', BUILD_HASH.substring(0, 10));
        }
      }
      
      // PERFORMANCE FIX: Check cache FIRST before any API calls - CRITICAL FOR FAST STARTUP
      const cachedTenant = localStorage.getItem('tenant_config_cache');
      let cachedEtag: string | null = null;
      let cachedLastDeployedAt: string | null = null;
      let usedCache = false;
      if (cachedTenant) {
        try {
          const parsed = JSON.parse(cachedTenant);
          cachedEtag = parsed.etag || null;
          cachedLastDeployedAt = parsed.last_deployed_at || null;
          // Short TTL for fast paint; correctness comes from ETag/last_deployed_at revalidation below.
          const cacheValidity = isOnline ? 300000 : 86400000; // 5 min online, 24h offline

          if (Date.now() - parsed.timestamp < cacheValidity) {
            console.log('📦 [TenantProvider] Using cached tenant config (fast paint)');
            setTenant(parsed.data);
            tenantIsolationService.setTenantContext(parsed.data.id, domain);
            applyThemeToDOM(parsed.data.branding, parsed.data.theme);
            setLastUpdated(new Date(parsed.timestamp));
            window.__TENANT_LOADED__ = true;
            window.__TENANT_BRANDING__ = parsed.data.branding;
            setIsLoading(false);
            usedCache = true;
            // Fall through to revalidate against the edge function (won't re-paint unless ETag changed)
          } else {
            console.log('⏰ [TenantProvider] Cache expired, fetching fresh config');
          }
        } catch (e) {
          console.warn('⚠️ [TenantProvider] Failed to parse cache:', e);
          localStorage.removeItem('tenant_config_cache');
        }
      }

      // OPTION 1: Try centralized API first (cleaner)
      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        const tenantConfigParams = new URLSearchParams({ domain, t: Date.now().toString() });
        const tenantConfigUrl = `${getSupabaseFunctionUrl('tenant-config')}?${tenantConfigParams.toString()}`;

        const response = await fetch(tenantConfigUrl, {
          method: 'GET',
          headers,
        });

        if (response.status === 304 && usedCache) {
          console.log('⚡ [TenantProvider] 304 Not Modified — keeping cached theme');
          return;
        }

        if (response.ok) {
          const apiConfig = await response.json();
          const newLda = apiConfig?.metadata?.last_deployed_at || null;
          const newEtag = apiConfig?.metadata?.etag || response.headers.get('etag') || null;

          // If we already painted from cache and nothing changed, skip the re-apply.
          if (
            usedCache &&
            newLda &&
            cachedLastDeployedAt &&
            newLda === cachedLastDeployedAt &&
            newEtag === cachedEtag
          ) {
            console.log('⚡ [TenantProvider] last_deployed_at unchanged — cached theme is current');
            return;
          }

          console.log('✅ [TenantProvider] Theme refresh from edge function', {
            tenant_name: apiConfig.tenant?.name,
            last_deployed_at: newLda,
            replaced_cache: usedCache,
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
            theme: normalizeThemeConfig(apiConfig.theme),
            pwa: apiConfig.pwa,
            splashScreens: apiConfig.splash_screens,
            features: apiConfig.features,
            settings: apiConfig.settings,
          };

          setTenant(config);
          tenantIsolationService.setTenantContext(config.id, domain);
          applyThemeToDOM(config.branding, config.theme);
          setLastUpdated(new Date());

          window.__TENANT_LOADED__ = true;
          window.__TENANT_BRANDING__ = config.branding;

          await localDB.saveTenantConfig(config.id, {
            brand_identity: apiConfig.branding,
            mobile_theme: apiConfig.theme,
            pwa_config: apiConfig.pwa,
          }, { id: config.id, name: config.name, domain });

          localStorage.setItem('tenant_config_cache', JSON.stringify({
            data: config,
            timestamp: Date.now(),
            etag: newEtag,
            last_deployed_at: newLda,
          }));

          console.log('✅ [TenantProvider] Config cached for offline use');
          return;
        }
      } catch (apiError) {

        console.error('❌ [TenantProvider] API failed, falling back to direct DB access');
        console.error('❌ [TenantProvider] API Error details:', apiError);
        console.error('❌ [TenantProvider] API Error message:', (apiError as Error)?.message);
      }

      // OPTION 1B: Public white-label endpoint fallback. This avoids direct `tenants`
      // table reads from the mobile app, which are intentionally blocked by RLS.
      try {
        const params = new URLSearchParams({ domain, t: Date.now().toString() });
        const response = await fetch(`${getSupabaseFunctionUrl('get-white-label-config')}?${params.toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (response.ok) {
          const payload = await response.json();
          const config = buildConfigFromWhiteLabelPayload(payload, domain);
          if (config) {
            const newLda = payload?.metadata?.last_deployed_at || payload?.whiteLabelConfig?.last_deployed_at || null;
            const newEtag = payload?.metadata?.etag || response.headers.get('etag') || null;

            console.log('✅ [TenantProvider] Theme refresh from white-label endpoint', {
              tenant_name: config.name,
              last_deployed_at: newLda,
            });

            setTenant(config);
            tenantIsolationService.setTenantContext(config.id, domain);
            applyThemeToDOM(config.branding, config.theme);
            setLastUpdated(new Date());

            window.__TENANT_LOADED__ = true;
            window.__TENANT_BRANDING__ = config.branding;

            await localDB.saveTenantConfig(config.id, payload.whiteLabelConfig, {
              id: config.id,
              name: config.name,
              domain,
            });

            localStorage.setItem('tenant_config_cache', JSON.stringify({
              data: config,
              timestamp: Date.now(),
              etag: newEtag,
              last_deployed_at: newLda,
            }));

            return;
          }
        }
      } catch (whiteLabelError) {
        console.error('❌ [TenantProvider] White-label endpoint fallback failed:', whiteLabelError);
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
            },
            theme: mergeThemeGroups(whiteLabel?.theme_colors as any, whiteLabel?.mobile_theme as any),
            pwa: whiteLabel?.pwa_config as PWAConfig,
            splashScreens: (whiteLabel as any)?.splash_screens as SplashScreenConfig,
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

            // Signal tenant ready
            window.__TENANT_LOADED__ = true;
            window.__TENANT_BRANDING__ = config.branding;
            
            console.log('✅ [TenantProvider] Tenant loaded:', config.name);
            console.log('🎯 [TenantProvider] Tenant loaded signal sent to loader');
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
            },
            theme: mergeThemeGroups(matchedConfig.theme_colors as any, matchedConfig.mobile_theme as any),
            pwa: matchedConfig.pwa_config as PWAConfig,
            splashScreens: (matchedConfig as any)?.splash_screens as SplashScreenConfig,
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

          // Signal tenant ready
          window.__TENANT_LOADED__ = true;
          window.__TENANT_BRANDING__ = config.branding;

          console.log('✅ [TenantProvider] Tenant loaded:', config.name);
          console.log('🎯 [TenantProvider] Tenant loaded signal sent to loader');
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
              // No fallback colors - let CSS defaults handle it until theme loads
            },
            theme: mergeThemeGroups(whiteLabel?.theme_colors as any, whiteLabel?.mobile_theme as any),
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
          
          // Signal tenant ready
          window.__TENANT_LOADED__ = true;
          window.__TENANT_BRANDING__ = defaultTenant.branding;
          console.log('🎯 [TenantProvider] Default tenant loaded signal sent to loader');
          
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
              // No fallback colors - let CSS defaults handle it
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
              // No fallback colors - let CSS defaults handle it
            },
            theme: mergeThemeGroups(cachedConfig.white_label_config?.theme_colors as any, cachedConfig.white_label_config?.mobile_theme as any),
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
  }, [getCurrentDomain, applyThemeToDOM, buildConfigFromWhiteLabelPayload, loadOfflineConfig]);

  // Clear cache and refetch (for theme updates)
  const clearCache = useCallback(() => {
    console.log('[TenantProvider] 🗑️ Clearing cache and refetching...');
    localStorage.removeItem('tenant_config_cache');
    fetchTenantConfig();
  }, [fetchTenantConfig]);

  // Listen for theme update events from WhiteLabelService and PWA silent updates
  useEffect(() => {
    const handleThemeUpdate = () => {
      console.log('[TenantProvider] 🎨 Theme update event received');
      clearCache();
    };

    const handleSilentThemeUpdate = () => {
      console.log('[TenantProvider] 🎨 Silent theme update event received from PWA');
      clearCache();
    };
    
    window.addEventListener('theme-updated', handleThemeUpdate);
    window.addEventListener('themeUpdated', handleThemeUpdate);
    window.addEventListener('tenant-theme-update', handleSilentThemeUpdate);
    
    return () => {
      window.removeEventListener('theme-updated', handleThemeUpdate);
      window.removeEventListener('themeUpdated', handleThemeUpdate);
      window.removeEventListener('tenant-theme-update', handleSilentThemeUpdate);
    };
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
    splashScreens: tenant?.splashScreens || null,
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
