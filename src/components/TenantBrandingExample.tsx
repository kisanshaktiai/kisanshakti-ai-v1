/**
 * Example component demonstrating how to use the new TenantProvider
 * 
 * This can be used as a reference for migrating other components from useTenantStore to useTenant
 */

import { useTenant } from '@/contexts/TenantContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function TenantBrandingExample() {
  const { tenant, branding, theme, features, isLoading, error, refetch } = useTenant();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-[200px]" />
          <Skeleton className="h-4 w-[300px]" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Failed to Load Tenant</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={refetch}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (!tenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Tenant Configuration</CardTitle>
          <CardDescription>Unable to load tenant settings</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {branding?.logo_url && (
              <img 
                src={branding.logo_url} 
                alt={branding.company_name || 'Logo'} 
                className="h-12 w-12 rounded-md object-contain"
              />
            )}
            <div>
              <CardTitle>{branding?.company_name || tenant.name}</CardTitle>
              {branding?.tagline && (
                <CardDescription>{branding.tagline}</CardDescription>
              )}
            </div>
          </div>
          <Button onClick={refetch} variant="outline" size="sm">
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tenant Info */}
        <div className="space-y-2">
          <h3 className="font-semibold">Tenant Information</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">ID:</span>{' '}
              <code className="text-xs">{tenant.id.slice(0, 8)}...</code>
            </div>
            <div>
              <span className="text-muted-foreground">Domain:</span>{' '}
              <span className="font-mono text-xs">{tenant.domain}</span>
            </div>
            {tenant.status && (
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <Badge variant={tenant.status === 'active' ? 'default' : 'secondary'}>
                  {tenant.status}
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Branding Colors */}
        {branding && (
          <div className="space-y-2">
            <h3 className="font-semibold">Brand Colors</h3>
            <div className="flex gap-2">
              {branding.primary_color && (
                <div className="flex flex-col items-center gap-1">
                  <div 
                    className="h-12 w-12 rounded-md border"
                    style={{ backgroundColor: branding.primary_color }}
                  />
                  <span className="text-xs text-muted-foreground">Primary</span>
                </div>
              )}
              {branding.secondary_color && (
                <div className="flex flex-col items-center gap-1">
                  <div 
                    className="h-12 w-12 rounded-md border"
                    style={{ backgroundColor: branding.secondary_color }}
                  />
                  <span className="text-xs text-muted-foreground">Secondary</span>
                </div>
              )}
              {branding.accent_color && (
                <div className="flex flex-col items-center gap-1">
                  <div 
                    className="h-12 w-12 rounded-md border"
                    style={{ backgroundColor: branding.accent_color }}
                  />
                  <span className="text-xs text-muted-foreground">Accent</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Theme Info */}
        {theme && (
          <div className="space-y-2">
            <h3 className="font-semibold">Theme Configuration</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Core Colors:</span>{' '}
                {theme.core ? Object.keys(theme.core).length : 0}
              </div>
              <div>
                <span className="text-muted-foreground">Status Colors:</span>{' '}
                {theme.status ? Object.keys(theme.status).length : 0}
              </div>
              {theme.typography?.font_family && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Font:</span>{' '}
                  <span className="font-mono text-xs">{theme.typography.font_family}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Features */}
        {features.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold">Enabled Features</h3>
            <div className="flex flex-wrap gap-1">
              {features.map((feature) => (
                <Badge key={feature} variant="outline">
                  {feature}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Settings */}
        <div className="space-y-2">
          <h3 className="font-semibold">Settings</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Default Language:</span>{' '}
              <Badge variant="secondary">{tenant.settings.defaultLanguage.toUpperCase()}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Supported Languages:</span>{' '}
              {tenant.settings.languages.length}
            </div>
          </div>
        </div>

        {/* Developer Info */}
        <details className="rounded-lg border p-2">
          <summary className="cursor-pointer font-mono text-xs text-muted-foreground">
            Developer Info (Click to expand)
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
            {JSON.stringify(
              { tenant, branding, theme: theme ? 'configured' : null, features },
              null,
              2
            )}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
