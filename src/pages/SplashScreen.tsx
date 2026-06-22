import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { versionService } from '@/services/versionService';
import { FarmingSplashAnimation } from '@/components/splash/FarmingSplashAnimation';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { tenant, branding, isLoading, error } = useTenant();
  const { checkAuth, isAuthenticated } = useAuthStore();
  const { markSplashCompleted, hasSelectedLanguage } = useAuthFlowStore();
  const [isReady, setIsReady] = useState(false);
  const [startX, setStartX] = useState(0);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    console.log('🚀 [SplashScreen] Tenant data:', { 
      hasTenant: !!tenant, 
      hasBranding: !!branding,
      isLoading,
      isOnline: navigator.onLine,
      logoUrl: branding?.logo_url,
      companyName: branding?.company_name
    });

    const initializeApp = async () => {
      const isOnline = navigator.onLine;
      
      // OFFLINE-FIRST: If offline, don't wait for tenant to load from network
      // Use cached data and proceed faster
      if (!isOnline) {
        console.log('📴 [SplashScreen] Device is OFFLINE - using cached data');
        
        // Check auth immediately
        await checkAuth();
        
        // Use cached version or fallback
        setAppVersion(versionService.getCurrentVersion());
        
        // Ready faster for offline
        setTimeout(() => {
          setIsReady(true);
        }, 400);
        return;
      }
      
      // PRODUCTION FIX: Fast startup - don't block on tenant loading if we have any data
      const cachedTenantRaw = localStorage.getItem('tenant_config_cache');
      const hasCachedTenant = !!cachedTenantRaw;
      
      // If tenant is loading but we have cache, proceed immediately
      if (isLoading && !tenant && hasCachedTenant) {
        console.log('🚀 [SplashScreen] Using cached data for fast startup');
        await checkAuth();
        setAppVersion(versionService.getCurrentVersion());
        setTimeout(() => setIsReady(true), 200); // Super fast with cache
        return;
      }
      
      // ONLINE: Wait for tenant only if no cache exists (first-time user)
      if (isLoading && !tenant && !hasCachedTenant) {
        console.log('⏳ [SplashScreen] First-time user, waiting for tenant...');
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
      
      // PERFORMANCE FIX: Use local version immediately, fetch from DB in background (non-blocking)
      setAppVersion(versionService.getCurrentVersion());
      
      // Quick ready state - don't wait for version API
      setTimeout(() => {
        setIsReady(true);
      }, 400); // Reduced from 800ms
      
      // Fetch version from database in background (non-blocking)
      versionService.fetchVersionFromDatabase().then(versionData => {
        if (versionData) {
          setAppVersion(versionData.version);
          
          // Check for force update (handle in background)
          if (versionData.forceUpdate) {
            console.log('[SplashScreen] Force update required, updating app...');
            versionService.forceUpdate();
          }
        }
      }).catch(err => {
        console.error('[SplashScreen] Error fetching version:', err);
      });
    };

    initializeApp();
  }, [tenant, isLoading, checkAuth, error, branding]);

  const handleContinue = () => {
    markSplashCompleted();
    
    // Skip language selection if language is already stored
    const storedLanguage = localStorage.getItem('language-storage');
    
    // Check if user is fully authenticated (session exists and PIN is verified)
    if (isAuthenticated) {
      navigate('/app');
    } else if (storedLanguage || hasSelectedLanguage) {
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

  // CRITICAL FIX: Never return null - always show some UI
  // Previously this returned null which caused a white screen if tenant loading failed
  // Now we proceed with fallback values and show the splash screen regardless

  // Get branding from TenantProvider - colors are already applied to DOM via CSS variables
  const logoUrl = branding?.logo_url;
  const companyName = branding?.company_name || tenant?.name || 'KisanShakti';
  const tagline = (branding?.tagline && branding.tagline.trim()) || 'Empowering Farmers with Technology';
  
  // Use tenant background color if available, otherwise use CSS variable
  const backgroundColor = branding?.background_color 
    ? (branding.background_color.startsWith('#') 
        ? branding.background_color 
        : `hsl(${branding.background_color})`)
    : undefined;
  
  return (
    <div 
      className="min-h-mobile-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{ 
        backgroundColor: backgroundColor || undefined,
        background: !backgroundColor ? 'hsl(var(--background))' : undefined
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black_40%,transparent_100%)] opacity-10" />

      {/* Farming-themed ambient animation */}
      <FarmingSplashAnimation />
      
      {/* Main Content */}
      <div className="flex flex-col items-center justify-center z-10 max-w-md mx-auto space-y-10">
        {/* App Logo - Minimal padding, logo fills container */}
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
            className="absolute inset-0 rounded-3xl blur-2xl opacity-20"
            style={{ 
              background: `hsl(var(--primary))`,
              transform: 'scale(1.1)'
            }}
          />
          
          {/* Logo Container - Minimal padding, logo edge-to-edge */}
          <div className="relative w-24 h-24 rounded-3xl bg-white shadow-2xl flex items-center justify-center border border-border/30 overflow-hidden p-1">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={companyName} 
                className="w-full h-full object-contain"
              />
            ) : (
              <svg 
                viewBox="0 0 24 24" 
                fill="none" 
                className="w-full h-full p-2"
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
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            {companyName}
          </h1>
          <p className="text-muted-foreground text-sm font-medium max-w-xs mx-auto">
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
            <div className="text-warning-foreground text-sm text-center px-4 py-3 bg-warning/10 border border-warning/20 rounded-xl backdrop-blur-sm">
              {error.message || 'Loading error'}
            </div>
          ) : !isReady ? (
            <div className="flex items-center justify-center space-x-3 text-muted-foreground px-4 py-3 bg-muted/50 rounded-xl backdrop-blur-sm border border-border/50">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="font-medium text-sm">
                {t('common.loading', 'Initializing...')}
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
              >
                <Button
                  onClick={handleContinue}
                  size="lg"
                  className="w-full bg-primary hover:bg-primary-hover text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 group rounded-xl h-12 text-sm font-semibold"
                >
                  {t('common.getStarted', 'Get Started')}
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </motion.div>
              
              <motion.p 
                className="text-muted-foreground text-xs text-center font-medium"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                {t('common.swipeLeft', 'Swipe left to continue')} →
              </motion.p>
            </div>
          )}
        </motion.div>

        {/* Version Badge - Fixed position at bottom */}
        {appVersion && (
          <motion.div 
            className="fixed bottom-4 left-1/2 -translate-x-1/2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <div className="px-3 py-1.5 bg-muted/50 backdrop-blur-sm border border-border/50 rounded-full">
              <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                v{appVersion}
              </span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}