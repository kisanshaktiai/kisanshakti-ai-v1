import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { Loader2, ArrowRight, Sparkles } from 'lucide-react';
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
      className="min-h-screen flex flex-col items-center justify-between p-8 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white/5"
            style={{
              width: `${Math.random() * 200 + 100}px`,
              height: `${Math.random() * 200 + 100}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, Math.random() * 50 - 25],
              x: [0, Math.random() * 50 - 25],
              scale: [1, 1.1, 1],
              opacity: [0.1, 0.2, 0.1],
            }}
            transition={{
              duration: 8 + Math.random() * 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center z-10">
        <div className="text-center space-y-10">
          {/* App Icon with Glow */}
          <motion.div 
            className="relative w-36 h-36 mx-auto"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ 
              type: "spring", 
              stiffness: 200, 
              damping: 20,
              duration: 0.8 
            }}
          >
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-[2rem] bg-white/30 blur-3xl animate-pulse" />
            
            {/* Icon container */}
            <div className="relative w-full h-full rounded-[2rem] bg-white/15 backdrop-blur-xl border border-white/30 flex items-center justify-center shadow-2xl">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt={companyName}
                  className="w-24 h-24 object-contain drop-shadow-2xl"
                  onError={(e) => {
                    console.error('❌ [SplashScreen] Failed to load logo:', logoUrl);
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div className="text-white text-6xl font-bold drop-shadow-lg">
                  {companyName.charAt(0)}
                </div>
              )}
              
              {/* Floating sparkle */}
              <motion.div
                className="absolute -top-2 -right-2"
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 180, 360],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Sparkles className="w-8 h-8 text-white/80" />
              </motion.div>
            </div>
          </motion.div>

          {/* App Name */}
          <motion.div 
            className="space-y-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <h1 className="text-5xl font-bold text-white drop-shadow-lg tracking-tight">
              {companyName}
            </h1>
            <p className="text-white/90 text-lg px-8 font-medium">
              {tagline}
            </p>
          </motion.div>

          {/* Loading or Ready State */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {error ? (
              <div className="text-warning-foreground text-sm px-8 bg-white/10 backdrop-blur-sm rounded-full py-3 border border-white/20">
                {error.message || 'Loading error'}
              </div>
            ) : !isReady ? (
              <div className="flex items-center justify-center space-x-3 text-white/80 bg-white/10 backdrop-blur-sm rounded-full px-6 py-3 border border-white/20">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="font-medium">
                  {t('common.loading') || 'Initializing...'}
                </span>
              </div>
            ) : (
              <div className="space-y-5">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
                >
                  <Button
                    onClick={handleContinue}
                    variant="pill-gradient"
                    size="lg"
                    className="bg-white/20 hover:bg-white/30 text-white border-white/40 backdrop-blur-md shadow-2xl hover:shadow-[0_0_40px_rgba(255,255,255,0.4)] group min-w-[220px]"
                  >
                    {t('common.getStarted') || 'Get Started'}
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </motion.div>
                
                <motion.p 
                  className="text-white/70 text-sm font-medium flex items-center justify-center gap-2"
                  animate={{ x: [-5, 5, -5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <span>←</span>
                  {t('common.swipeLeft') || 'Swipe left to continue'}
                </motion.p>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Bottom Section */}
      <motion.div 
        className="space-y-6 z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
      >
        {/* Progress Dots */}
        <div className="flex justify-center space-x-3">
          {[1, 0.5, 0.3, 0.2].map((opacity, i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-white shadow-lg"
              style={{ opacity }}
              animate={{
                scale: i === 0 ? [1, 1.3, 1] : 1,
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </div>
        
        {/* Version */}
        <div className="text-center text-white/60 text-xs font-medium tracking-wider">
          VERSION {appVersion}
        </div>
      </motion.div>
    </div>
  );
}