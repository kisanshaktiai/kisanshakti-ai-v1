import { Outlet, useLocation } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { HindenburgMenu } from './HindenburgMenu';
import { FloatingActionButton } from './FloatingActionButton';
import { LanguageSelector } from './LanguageSelector';
import { useTenantStore } from '@/stores/tenantStore';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { Leaf } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SyncButton } from '@/components/sync/SyncButton';

export function AppLayout() {
  const { tenant, applyWhiteLabelTheme } = useTenantStore();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  
  // Check if we're on the AI chat page or community chat
  const isAIChat = location.pathname === '/app/chat';
  const isCommunityChat = location.pathname.includes('/app/social/community/');

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
    <div className="min-h-mobile-screen bg-background">
      {/* Header - Hidden on AI Chat and Community Chat */}
      {!isAIChat && !isCommunityChat && (
        <header className="fixed top-0 left-0 right-0 h-14 bg-card border-b border-border z-40 flex items-center justify-between px-4 pt-safe">
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
          <div className="flex items-center gap-2">
            <SyncButton />
            <LanguageSelector />
          </div>
        </header>
      )}

      {/* Main Content - Adjust padding based on route */}
      <main className={
        isAIChat || isCommunityChat 
          ? "" 
          : "pt-14 pb-nav-safe mobile-scroll-container"
      }>
        <Outlet />
      </main>

      {/* Bottom Navigation - Hidden on full-screen routes */}
      <BottomNavigation 
        onMenuOpen={() => setIsMenuOpen(true)} 
        hideNav={isAIChat || isCommunityChat}
        hideAction={false}
      />
      
      {/* Floating Action Button - Hidden on full-screen routes */}
      {!isAIChat && !isCommunityChat && <FloatingActionButton />}
      
      {/* Hindenburg Menu */}
      <HindenburgMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </div>
  );
}