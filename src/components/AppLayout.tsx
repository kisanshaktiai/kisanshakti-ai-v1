import { Outlet } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { LanguageSelector } from './LanguageSelector';
import { useTenantStore } from '@/stores/tenantStore';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';

export function AppLayout() {
  const { tenant } = useTenantStore();
  const { user } = useAuthStore();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-card border-b border-border z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          {tenant?.whiteLabel?.brand_identity?.logo_url && (
            <img 
              src={tenant.whiteLabel.brand_identity.logo_url} 
              alt={tenant.whiteLabel.brand_identity.company_name || tenant.name}
              className="h-8 w-auto object-contain"
            />
          )}
          <div>
            <h1 className="text-lg font-bold text-primary">
              {tenant?.whiteLabel?.brand_identity?.company_name || tenant?.name || t('app.name')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {user?.fullName ? `Welcome, ${user.fullName}` : tenant?.whiteLabel?.brand_identity?.tagline || t('app.tagline')}
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