import { Outlet, useLocation } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { HindenburgMenu } from './HindenburgMenu';
import { LanguageSelector } from './LanguageSelector';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { Leaf } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SyncButton } from '@/components/sync/SyncButton';
import { useProactiveAlerts } from '@/hooks/useProactiveAlerts';
import { ConnectionStatusIcon } from '@/components/ConnectionStatusIcon';
import { ModernVoiceProvider } from '@/contexts/ModernVoiceContext';
import { ModernVoiceAssistant } from '@/components/voice';
import { VoiceIndicator } from '@/components/VoiceIndicator';
import { NativeVoiceButton } from '@/components/voice/NativeVoiceButton';
import { useVoiceNavigationStore } from '@/stores/voiceNavigationStore';

export function AppLayout() {
  const { tenant, branding } = useTenant();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  
  // Global real-time alert listener — fires toasts + WhatsApp nudges on ALL pages
  useProactiveAlerts();
  
  // Scroll to top on route change — RouterProvider doesn't do this automatically
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);
  
  // Check if we're on the AI chat page or community chat
  const isAIChat = location.pathname === '/app/chat';
  const isCommunityChat = location.pathname.includes('/app/community/') && location.pathname.includes('/chat');

  // Get branding from TenantProvider (theme is applied automatically by TenantProvider)
  const logoUrl = branding?.logo_url;
  const companyName = branding?.company_name || tenant?.name || t('app.name');
  const tagline = branding?.tagline || t('app.tagline');

  // Debug logging for branding
  useEffect(() => {
    console.log('🖼️ [AppLayout] Branding from TenantProvider:', {
      logoUrl,
      companyName,
      tagline,
      hasTenant: !!tenant,
      hasBranding: !!branding
    });
  }, [logoUrl, companyName, tagline, tenant, branding]);

  return (
    <ModernVoiceProvider>
      <div className="flex flex-col h-mobile-screen bg-background">
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
              <ConnectionStatusIcon />
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

        {/* Voice Assistant */}
        <ModernVoiceAssistant />
        <VoiceIndicator />
        
        {/* Native Voice Navigation Button - Floating */}
        <NativeVoiceButton 
          className="bottom-24 right-4"
          size="md"
          showTranscript={true}
          showExamples={true}
        />

        {/* Bottom Navigation - Hidden on full-screen routes */}
        <BottomNavigation 
          onMenuOpen={() => setIsMenuOpen(true)} 
          hideNav={isAIChat || isCommunityChat}
          hideAction={false}
        />
        
        {/* Hindenburg Menu */}
        <HindenburgMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      </div>
    </ModernVoiceProvider>
  );
}