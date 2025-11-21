import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { Loader2, ChevronRight, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { tenant, branding, isLoading, error } = useTenant();
  const { checkAuth, isAuthenticated } = useAuthStore();
  const { markSplashCompleted, hasCompletedSplash, hasSelectedLanguage } = useAuthFlowStore();
  const [isReady, setIsReady] = useState(false);
  const [startX, setStartX] = useState(0);

  useEffect(() => {
    console.log('🚀 [SplashScreen] Tenant data:', { 
      hasTenant: !!tenant, 
      hasBranding: !!branding,
      isLoading,
      logoUrl: branding?.logo_url,
      companyName: branding?.company_name
    });

    const initializeApp = async () => {
      // Wait for tenant to load from TenantProvider
      if (isLoading || !tenant) {
        console.log('⏳ [SplashScreen] Waiting for tenant to load...');
        return;
      }

      // Check if we're in development mode
      const isDevelopment = window.location.hostname.includes('localhost') || 
                           window.location.hostname.includes('lovable.app') ||
                           window.location.hostname.includes('lovableproject.com');

      // In development, ignore tenant errors and continue
      if (error && isDevelopment) {
        console.warn('⚠️ [SplashScreen] Tenant error in development mode, continuing anyway:', error);
      } else if (error && !isDevelopment) {
        console.error('❌ [SplashScreen] Tenant error in production:', error);
        setIsReady(true);
        return;
      }

      console.log('✅ [SplashScreen] Tenant loaded, checking auth...');
      await checkAuth();
      
      // Quick ready state
      setTimeout(() => {
        setIsReady(true);
      }, 800);
    };

    initializeApp();
  }, [tenant, isLoading, checkAuth]);

  const handleContinue = () => {
    markSplashCompleted();
    
    // Check if user is fully authenticated (session exists and PIN is verified)
    if (isAuthenticated) {
      navigate('/app');
    } else if (hasSelectedLanguage) {
      navigate('/auth');
    } else {
      navigate('/language-selection');
    }
  };

  // Handle swipe gesture
  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX;
    const diffX = startX - endX;
    
    // If swipe left is detected (more than 50px)
    if (diffX > 50 && isReady) {
      handleContinue();
    }
  };

  // Get theme colors and branding from TenantProvider
  const primaryColor = branding?.primary_color || '#10b981';
  const secondaryColor = branding?.secondary_color || '#059669';
  const backgroundColor = branding?.background_color || '#ffffff';
  const logoUrl = branding?.logo_url;
  const companyName = branding?.company_name || tenant?.name || 'KisanShakti';
  const tagline = branding?.tagline || 'Empowering Farmers with Technology';
  const appVersion = '2.0';
  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-between p-6 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center space-y-8 animate-fade-in">
          {/* App Icon */}
          <div className="w-32 h-32 mx-auto rounded-3xl bg-overlay-light/20 backdrop-blur-sm flex items-center justify-center animate-scale-in">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={companyName}
                className="w-24 h-24 object-contain"
                onError={(e) => {
                  console.error('❌ [SplashScreen] Failed to load logo:', logoUrl);
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="text-overlay-light text-6xl font-bold">
                {companyName.charAt(0)}
              </div>
            )}
          </div>

          {/* App Name */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-overlay-light animate-fade-in">
              {companyName}
            </h1>
            <p className="text-overlay-light/80 text-lg px-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
              {tagline}
            </p>
          </div>

          {/* Loading or Ready State */}
          {error ? (
            <div className="text-warning-foreground text-sm px-8 animate-fade-in">
              {error.message || 'Loading error'}
            </div>
          ) : !isReady ? (
            <div className="flex items-center justify-center space-x-2 text-overlay-light/60">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">
                {t('common.loading') || 'Loading...'}
              </span>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <Button
                onClick={handleContinue}
                className="bg-overlay-light/20 hover:bg-overlay-light/30 text-overlay-light border border-overlay-light/30 backdrop-blur-sm px-8 py-6 text-lg group"
              >
                {t('common.getStarted') || 'Get Started'}
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              
              <p className="text-overlay-light/60 text-sm">
                {t('common.swipeLeft') || 'Swipe left to continue'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section */}
      <div className="space-y-4">
        {/* Progress Dots */}
        <div className="flex justify-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-overlay-light"></div>
          <div className="w-2 h-2 rounded-full bg-overlay-light/40"></div>
          <div className="w-2 h-2 rounded-full bg-overlay-light/40"></div>
          <div className="w-2 h-2 rounded-full bg-overlay-light/40"></div>
        </div>
        
        {/* Version */}
        <div className="text-center text-overlay-light/50 text-xs">
          v{appVersion}
        </div>
      </div>
    </div>
  );
}