import { Outlet } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { LanguageSelector } from './LanguageSelector';
import { useTenantStore } from '@/stores/tenantStore';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { Leaf } from 'lucide-react';
import { useEffect } from 'react';

export function AppLayout() {
  const { tenant, applyWhiteLabelTheme } = useTenantStore();
  const { user } = useAuthStore();
  const { t } = useTranslation();

  // Apply theme whenever tenant changes
  useEffect(() => {
    if (tenant?.whiteLabel) {
      applyWhiteLabelTheme(tenant.whiteLabel);
    }
  }, [tenant, applyWhiteLabelTheme]);

  // Get logo URL from white label config
  const logoUrl = tenant?.whiteLabel?.brand_identity?.logo_url;
  const companyName = tenant?.whiteLabel?.brand_identity?.company_name || tenant?.name || t('app.name');
  const tagline = tenant?.whiteLabel?.brand_identity?.tagline || t('app.tagline');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-card border-b border-border z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={companyName}
              className="h-8 w-auto object-contain"
              onError={(e) => {
                // Fallback to default icon if image fails to load
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <Leaf className={`h-8 w-8 text-primary ${logoUrl ? 'hidden' : ''}`} />
          <div>
            <h1 className="text-lg font-bold text-primary">
              {companyName}
            </h1>
            <p className="text-xs text-muted-foreground">
              {user?.fullName ? `Welcome, ${user.fullName}` : tagline}
            </p>
          </div>
        </div>
        <LanguageSelector />
      </header>

      {/* Main Content */}
      <main className="pt-14 pb-nav">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}