/**
 * Tenant Hook
 * 
 * Re-export of the useTenant hook from TenantContext for better discoverability.
 * This follows the common React pattern of exposing hooks at the hooks/ level.
 * 
 * @example
 * ```tsx
 * import { useTenant } from '@/hooks/useTenant';
 * 
 * function MyComponent() {
 *   const { tenant, branding, isLoading } = useTenant();
 *   
 *   if (isLoading) return <Loading />;
 *   
 *   return <div style={{ color: branding.primary_color }}>{tenant.name}</div>;
 * }
 * ```
 */

export { useTenant, TenantProvider } from '@/contexts/TenantContext';
export type { TenantConfig, TenantContextValue, BrandingConfig, ThemeConfig } from '@/contexts/TenantContext';
