/**
 * Environment Detection Utility
 * 
 * Centralized environment detection for multi-tenant SaaS platform.
 * Ensures consistent behavior across development and production.
 */

export interface EnvironmentInfo {
  isDevelopment: boolean;
  isProduction: boolean;
  domain: string;
  protocol: string;
  port: string | null;
  defaultTenantId: string | null;
}

/**
 * Get current environment information
 */
export function getEnvironment(): EnvironmentInfo {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
  const port = typeof window !== 'undefined' ? window.location.port : null;

  // Development domains
  const developmentDomains = [
    'localhost',
    '127.0.0.1',
    'lovable.app',
    'lovableproject.com',
    'gptengineer.app'
  ];

  const isDevelopment = developmentDomains.some(dev => hostname.includes(dev));
  
  // Get default tenant from environment variable (for development)
  const defaultTenantId = import.meta.env.VITE_DEFAULT_TENANT_ID || null;

  return {
    isDevelopment,
    isProduction: !isDevelopment,
    domain: hostname,
    protocol,
    port,
    defaultTenantId,
  };
}

/**
 * Check if running in development mode
 */
export function isDevelopmentMode(): boolean {
  return getEnvironment().isDevelopment;
}

/**
 * Check if running in production mode
 */
export function isProductionMode(): boolean {
  return getEnvironment().isProduction;
}

/**
 * Get the tenant resolution strategy based on environment
 */
export function getTenantResolutionStrategy(): 'domain' | 'default' | 'env-variable' {
  const env = getEnvironment();
  
  if (env.isProduction) {
    return 'domain'; // Always resolve by domain in production
  }
  
  if (env.defaultTenantId) {
    return 'env-variable'; // Use environment variable if set
  }
  
  return 'default'; // Fall back to default tenant
}

/**
 * Log environment information (for debugging)
 */
export function logEnvironmentInfo(): void {
  const env = getEnvironment();
  console.log('🌍 [Environment] Current environment:', {
    mode: env.isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION',
    domain: env.domain,
    protocol: env.protocol,
    port: env.port,
    defaultTenantId: env.defaultTenantId,
    strategy: getTenantResolutionStrategy(),
  });
}
