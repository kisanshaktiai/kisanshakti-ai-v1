import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useTenantStore } from '@/stores/tenantStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { useAuthStore } from '@/stores/authStore';
import { Loader2, Phone, ArrowLeft, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AuthScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenant, isLoading: tenantLoading } = useTenantStore();
  const { setStep } = useAuthFlowStore();
  const { createSession } = useAuthStore();
  const [mobile, setMobile] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'check' | 'register'>('check');

  useEffect(() => {
    setStep('mobile');
    
    // If no tenant loaded, redirect to splash to ensure proper flow
    if (!tenantLoading && !tenant) {
      navigate('/splash');
    }
  }, [setStep, tenant, tenantLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!mobile || mobile.length < 10) {
      setError(t('auth.invalidMobile') || 'Please enter a valid 10-digit mobile number');
      return;
    }

    // CRITICAL: Ensure tenant is loaded before proceeding
    if (!tenant?.id) {
      setError(t('auth.tenantNotLoaded') || 'System is initializing. Please wait...');
      setTimeout(() => navigate('/splash'), 1500);
      return;
    }

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
      <div className="min-h-screen bg-gradient-primary flex items-center justify-center">
        <Card className="p-8">
          <div className="flex items-center space-x-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-muted-foreground">{t('common.loading')}</span>
          </div>
        </Card>
      </div>
    );
  }

  // Get branding from tenant
  const brandName = tenant?.whiteLabel?.brand_identity?.company_name || tenant?.name || 'KisanShakti';
  const primaryColor = tenant?.whiteLabel?.brand_identity?.primary_color;

  return (
    <div className="min-h-screen bg-gradient-primary flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6 shadow-xl">
        {/* Header */}
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/language-selection')}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.back')}
          </Button>
          
          <div className="text-center space-y-3">
            <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center animate-fade-in">
              <Phone className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                {mode === 'register' ? t('auth.register') : t('auth.welcome')} {brandName}
              </h1>
              <p className="text-sm text-muted-foreground">
                {mode === 'register' 
                  ? t('auth.registerDescription') || 'Create your account to get started'
                  : t('auth.enterPhoneDescription') || 'Enter your mobile number to continue'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant={mode === 'register' ? 'default' : 'destructive'}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('auth.mobileNumber')}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                +91
              </span>
              <Input
                type="tel"
                placeholder="9876543210"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="pl-12 h-12 text-lg"
                maxLength={10}
                required
                disabled={isLoading}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('auth.mobileHint') || "We'll use this number to identify you"}
            </p>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 text-base group" 
            disabled={isLoading || mobile.length < 10}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {mode === 'register' ? t('auth.registering') : t('auth.checking')}
              </>
            ) : (
              <>
                {mode === 'register' ? t('common.next') : t('common.continue')}
                <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </Button>
        </form>

        {mode === 'check' && (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {t('auth.noAccountYet')}{' '}
              <Button
                variant="link"
                onClick={() => setMode('register')}
                className="p-0 h-auto font-medium"
              >
                {t('auth.registerNow')}
              </Button>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}