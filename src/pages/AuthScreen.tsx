import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { useAuthStore } from '@/stores/authStore';
import { Loader2, Phone, ArrowLeft, ChevronRight, WifiOff, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { offlineAuthService } from '@/services/offlineAuthService';
import { motion } from 'framer-motion';

export default function AuthScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { setStep } = useAuthFlowStore();
  const { createSession } = useAuthStore();
  const [mobile, setMobile] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'check' | 'register'>('check');
  const [isReady, setIsReady] = useState(false);
  const isOnline = useOfflineStatus();

  useEffect(() => {
    setStep('mobile');
  }, [setStep]);

  // SECURITY: Blocking guard - wait for tenant before showing form
  useEffect(() => {
    if (!tenantLoading && tenant?.id) {
      console.log('✅ [Security] Tenant confirmed for auth screen:', tenant.id);
      setIsReady(true);
    }
    
    // If tenant loading failed, redirect to splash
    if (!tenantLoading && !tenant) {
      console.warn('⚠️ [Security] No tenant loaded, redirecting to splash');
      navigate('/');
    }
  }, [tenant, tenantLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!mobile || mobile.length < 10) {
      setError(t('auth.invalidMobile') || 'Please enter a valid 10-digit mobile number');
      return;
    }

    // CRITICAL SECURITY CHECK: Ensure tenant is loaded
    if (!tenant?.id) {
      console.error('🚨 [Security] Auth attempted without tenant context');
      setError(t('auth.tenantNotLoaded') || 'System is initializing. Please wait...');
      setTimeout(() => navigate('/'), 1500);
      return;
    }

    console.log('🔐 [Security] Auth request for tenant:', tenant.id);

    setIsLoading(true);
    setError(null);

    try {
      // Ensure mobile is clean and properly formatted
      const cleanMobile = mobile.trim().replace(/\D/g, '');
      
      // Debug logging
      console.log('Searching for farmer with:', {
        mobile_number: cleanMobile,
        mobile_type: typeof cleanMobile,
        mobile_length: cleanMobile.length,
        tenant_id: tenant.id,
        tenant_name: tenant.name
      });

      // MULTI-TENANT QUERY: Always filter by tenant_id + mobile_number
      // Mobile numbers are stored as strings without country code
      const { data: farmer, error: fetchError } = await supabase
        .from('farmers')
        .select('id, mobile_number, pin, pin_hash, tenant_id, farmer_code')
        .eq('mobile_number', cleanMobile)
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      console.log('Farmer search result:', { farmer, error: fetchError });

      if (fetchError) {
        console.error('Error fetching farmer:', fetchError);
        throw fetchError;
      }

      if (farmer) {
        // Farmer exists, create session and navigate to PIN entry
        createSession(farmer.id, tenant.id, cleanMobile);
        localStorage.setItem('authMobile', cleanMobile); // Store cleaned mobile
        localStorage.setItem('farmerId', farmer.id);
        localStorage.setItem('tenantId', tenant.id);
        setStep('pin');
        navigate('/pin');
      } else if (mode === 'register') {
        // Store registration data and navigate to PIN setup
        // Don't create farmer record yet - wait until PIN is set
        localStorage.setItem('registerMobile', cleanMobile);
        localStorage.setItem('tenantId', tenant.id);
        localStorage.setItem('isNewRegistration', 'true');
        setStep('setpin');
        navigate('/set-pin');
      } else {
        // User not found, switch to register mode
        setMode('register');
        setError(t('auth.noAccount') || 'No account found. Click Continue to register.');
      }
    } catch (err: any) {
      console.error('Error in auth:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while tenant is loading
  if (tenantLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glassmorphism-strong rounded-3xl p-8"
        >
          <div className="flex items-center space-x-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-muted-foreground">{t('common.loading')}</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // Get branding from tenant
  const brandName = tenant?.branding?.company_name || tenant?.name || 'KisanShakti';
  const primaryColor = tenant?.branding?.primary_color;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-primary/5"
            style={{
              width: `${200 + i * 100}px`,
              height: `${200 + i * 100}px`,
              left: `${20 + i * 30}%`,
              top: `${10 + i * 25}%`,
            }}
            animate={{
              y: [0, 30, 0],
              x: [0, 20, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 8 + i * 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Floating Card with Glassmorphism */}
        <div className="glassmorphism-strong rounded-3xl p-8 space-y-8 shadow-float border-2 border-white/10">
          {/* Header */}
          <div className="space-y-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/language-selection')}
              className="mb-2 hover:bg-primary/5"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('common.back')}
            </Button>
            
            <div className="text-center space-y-4">
              {/* Icon with glow */}
              <motion.div 
                className="relative w-24 h-24 mx-auto"
                animate={{
                  scale: [1, 1.05, 1],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl" />
                <div className="relative w-full h-full bg-gradient-primary rounded-full flex items-center justify-center shadow-glow">
                  <Phone className="w-12 h-12 text-white drop-shadow-lg" />
                </div>
                <motion.div
                  className="absolute -top-1 -right-1"
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="w-6 h-6 text-primary" />
                </motion.div>
              </motion.div>

              <div className="space-y-2">
                <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  {mode === 'register' ? t('auth.register') : t('auth.welcome')}
                </h1>
                <p className="text-base text-muted-foreground px-4">
                  {mode === 'register' 
                    ? t('auth.registerDescription') || 'Create your account to get started'
                    : t('auth.enterPhoneDescription') || 'Enter your mobile number to continue'}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Alert variant={mode === 'register' ? 'default' : 'destructive'} className="rounded-2xl">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground">
                {t('auth.mobileNumber')}
              </label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-base z-10">
                  +91
                </span>
                <Input
                  type="tel"
                  placeholder="9876543210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="pl-16 h-14 text-lg rounded-2xl border-2 focus:border-primary bg-background/50 backdrop-blur-sm"
                  maxLength={10}
                  required
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground pl-2">
                {t('auth.mobileHint') || "We'll use this number to identify you"}
              </p>
            </div>

            <Button 
              type="submit" 
              variant="pill-gradient"
              size="lg"
              className="w-full group" 
              disabled={isLoading || mobile.length < 10}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  {mode === 'register' ? t('auth.registering') : t('auth.checking')}
                </>
              ) : (
                <>
                  {mode === 'register' ? t('common.next') : t('common.continue')}
                  <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>
          </form>

          {mode === 'check' && (
            <div className="text-center pt-2">
              <p className="text-sm text-muted-foreground">
                {t('auth.noAccountYet')}{' '}
                <Button
                  variant="link"
                  onClick={() => setMode('register')}
                  className="p-0 h-auto font-semibold text-primary"
                >
                  {t('auth.registerNow')}
                </Button>
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}