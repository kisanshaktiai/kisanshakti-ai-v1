import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { tenant, branding, isLoading, error } = useTenant();
  const { checkAuth, isAuthenticated } = useAuthStore();
  const { markSplashCompleted, hasCompletedSplash, hasSelectedLanguage } = useAuthFlowStore();
  const [isReady, setIsReady] = useState(false);
  const [startX, setStartX] = useState(0);

  useEffect(() => {
    console.log('🚀 [SplashScreen] Mounted. Tenant data:', { 
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

      // Once tenant is loaded, remove HTML loader
      if (window.__removeHtmlLoader) {
        console.log('🎯 [SplashScreen] Tenant loaded, removing HTML loader');
        window.__removeHtmlLoader();
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
      }, 500);
    };

    initializeApp();
  }, [tenant, isLoading, checkAuth, error]);

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

  // Show minimal content while tenant loads (HTML loader still visible behind)
  if (isLoading || !tenant) {
    return (
      <div className="min-h-screen bg-background" style={{ opacity: 0 }}>
        {/* Hidden placeholder to prevent blank screen */}
      </div>
    );
  }

  // Get branding from TenantProvider - colors are already applied to DOM via CSS variables
  const logoUrl = branding?.logo_url;
  const companyName = branding?.company_name || tenant?.name || 'KisanShakti';
  const tagline = branding?.tagline || 'Empowering Farmers with Technology';
  const appVersion = '2.0';
  
  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden bg-gradient-to-br from-background via-background to-muted/30"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black_40%,transparent_100%)] opacity-20" />
      
      {/* Main Content */}
      <div className="flex flex-col items-center justify-center z-10 max-w-md mx-auto space-y-12">
        {/* App Logo with Glass Morphism */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ 
            type: "spring", 
            stiffness: 200, 
            damping: 20,
            duration: 0.6
          }}
          className="relative"
        >
          {/* Glow Effect */}
          <div 
            className="absolute inset-0 rounded-[2rem] blur-2xl opacity-20"
            style={{ 
              background: `hsl(var(--primary))`,
              transform: 'scale(1.1)'
            }}
          />
          
          {/* Logo Container with White Background */}
          <div className="relative w-28 h-28 rounded-[2rem] bg-white shadow-2xl flex items-center justify-center border border-border/50 overflow-hidden">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={companyName} 
                className="w-16 h-16 object-contain"
              />
            ) : (
              <svg 
                viewBox="0 0 24 24" 
                fill="none" 
                className="w-14 h-14"
              >
                <path 
                  d="M12 2L2 7v10c0 5.5 3.8 10.7 10 12 6.2-1.3 10-6.5 10-12V7l-10-5z" 
                  fill="hsl(var(--primary))"
                  opacity="0.1"
                />
                <path 
                  d="M12 2L2 7v10c0 5.5 3.8 10.7 10 12 6.2-1.3 10-6.5 10-12V7l-10-5z" 
                  stroke="hsl(var(--primary))"
                  strokeWidth="2"
                  fill="none"
                />
                <path 
                  d="M8 12l3 3 5-6" 
                  stroke="hsl(var(--primary))"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </motion.div>

        {/* App Name & Tagline */}
        <motion.div 
          className="text-center space-y-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <h1 className="text-4xl font-bold text-foreground tracking-tight">
            {companyName}
          </h1>
          <p className="text-muted-foreground text-base font-medium max-w-xs mx-auto">
            {tagline}
          </p>
        </motion.div>

        {/* Loading or Ready State */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {error ? (
            <div className="text-warning-foreground text-sm text-center px-6 py-4 bg-warning/10 border border-warning/20 rounded-2xl backdrop-blur-sm">
              {error.message || 'Loading error'}
            </div>
          ) : !isReady ? (
            <div className="flex items-center justify-center space-x-3 text-muted-foreground px-6 py-4 bg-muted/50 rounded-2xl backdrop-blur-sm border border-border/50">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="font-medium">
                {t('common.loading') || 'Initializing...'}
              </span>
            </div>
          ) : (
            <div className="space-y-6">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
              >
                <Button
                  onClick={handleContinue}
                  size="lg"
                  className="w-full bg-primary hover:bg-primary-hover text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 group rounded-2xl h-14 text-base font-semibold"
                >
                  {t('common.getStarted') || 'Get Started'}
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </motion.div>
              
              <motion.p 
                className="text-muted-foreground text-sm text-center font-medium"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                {t('common.swipeLeft') || 'Swipe left to continue'} →
              </motion.p>
            </div>
          )}
        </motion.div>

        {/* Version Badge */}
        <motion.div 
          className="absolute bottom-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <div className="px-4 py-2 bg-muted/50 backdrop-blur-sm border border-border/50 rounded-full">
            <span className="text-xs font-medium text-muted-foreground tracking-wider">
              VERSION {appVersion}
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}