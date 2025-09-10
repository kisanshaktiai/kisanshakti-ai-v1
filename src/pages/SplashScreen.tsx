import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantStore } from '@/stores/tenantStore';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { Loader2, ChevronRight, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { tenant, fetchTenant, isLoading, error } = useTenantStore();
  const { checkAuth, isAuthenticated } = useAuthStore();
  const { markSplashCompleted, hasCompletedSplash, hasSelectedLanguage } = useAuthFlowStore();
  const [isReady, setIsReady] = useState(false);
  const [startX, setStartX] = useState(0);

  useEffect(() => {
    const initializeApp = async () => {
      // Fetch tenant data
      await fetchTenant();
      
      // Check authentication
      await checkAuth();
      
      // Set ready state after initialization
      setTimeout(() => {
        setIsReady(true);
      }, 1500);
    };

    initializeApp();
  }, []);

  const handleContinue = () => {
    markSplashCompleted();
    
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

  // Get theme colors and branding from white label config
  const primaryColor = tenant?.whiteLabel?.brand_identity?.primary_color || '#10b981';
  const secondaryColor = tenant?.whiteLabel?.brand_identity?.secondary_color || '#059669';
  const backgroundColor = tenant?.whiteLabel?.pwa_config?.background_color || '#ffffff';
  const splashScreen = tenant?.whiteLabel?.splash_screens?.mobile || tenant?.whiteLabel?.splash_screens?.mobile_splash;
  const androidSplash = tenant?.whiteLabel?.splash_screens?.android;
  const logoUrl = tenant?.whiteLabel?.brand_identity?.logo_url;
  const companyName = tenant?.whiteLabel?.brand_identity?.company_name || tenant?.name || 'KisanShakti';
  const tagline = tenant?.whiteLabel?.brand_identity?.tagline || 'Empowering Farmers with Technology';
  const appVersion = tenant?.whiteLabel?.pwa_config?.short_name ? '2.0' : '1.0';
  
  // Use Android splash if available and on Android device
  const isAndroid = /Android/i.test(navigator.userAgent);
  const splashUrl = isAndroid && androidSplash?.url ? androidSplash.url : splashScreen;
  const splashBgColor = isAndroid && androidSplash?.backgroundColor ? androidSplash.backgroundColor : backgroundColor;

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-between p-6 relative overflow-hidden"
      style={{
        background: splashUrl ? `url(${splashUrl}) center/cover` :
          `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center space-y-8 animate-fade-in">
          {/* App Icon */}
          <div className="w-32 h-32 mx-auto rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center animate-scale-in">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={companyName}
                className="w-24 h-24 object-contain"
              />
            ) : (
              <div className="text-white text-6xl font-bold">
                {companyName.charAt(0)}
              </div>
            )}
          </div>

          {/* App Name */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white animate-fade-in">
              {companyName}
            </h1>
            <p className="text-white/80 text-lg px-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
              {tagline}
            </p>
          </div>

          {/* Loading or Ready State */}
          {error ? (
            <div className="text-yellow-200 text-sm px-8 animate-fade-in">
              {error}
            </div>
          ) : !isReady ? (
            <div className="flex items-center justify-center space-x-2 text-white/60">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">
                {tenant?.whiteLabel?.splash_screens?.loading_text || t('common.loading') || 'Loading...'}
              </span>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <Button
                onClick={handleContinue}
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-sm px-8 py-6 text-lg group"
              >
                {t('common.getStarted') || 'Get Started'}
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              
              <p className="text-white/60 text-sm">
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
          <div className="w-2 h-2 rounded-full bg-white"></div>
          <div className="w-2 h-2 rounded-full bg-white/40"></div>
          <div className="w-2 h-2 rounded-full bg-white/40"></div>
          <div className="w-2 h-2 rounded-full bg-white/40"></div>
        </div>
        
        {/* Version */}
        <div className="text-center text-white/50 text-xs">
          v{appVersion}
        </div>
      </div>
    </div>
  );
}