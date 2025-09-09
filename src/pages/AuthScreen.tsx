import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useTenantStore } from '@/stores/tenantStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { Loader2, Phone, ArrowLeft, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AuthScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenant, isLoading: tenantLoading } = useTenantStore();
  const { setStep } = useAuthFlowStore();
  const [mobile, setMobile] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'check' | 'register'>('check');

  useEffect(() => {
    setStep('mobile');
  }, [setStep]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!mobile || mobile.length < 10) {
      setError(t('auth.invalidMobile') || 'Please enter a valid 10-digit mobile number');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build query
      let query = supabase
        .from('farmers')
        .select('id, mobile_number, pin, pin_hash, tenant_id')
        .eq('mobile_number', mobile);
      
      // Only add tenant filter if tenant exists
      if (tenant?.id) {
        query = query.eq('tenant_id', tenant.id);
      }
      
      const { data: farmer, error: fetchError } = await query.maybeSingle();

      if (fetchError) {
        console.error('Error fetching farmer:', fetchError);
        throw fetchError;
      }

      if (farmer) {
        // Farmer exists, navigate to PIN entry
        localStorage.setItem('authMobile', mobile);
        localStorage.setItem('farmerId', farmer.id);
        setStep('pin');
        navigate('/pin');
      } else if (mode === 'register') {
        // Create new farmer
        const farmerData: any = {
          mobile_number: mobile,
          language_preference: localStorage.getItem('i18nextLng') || 'hi',
          is_active: true,
          app_install_date: new Date().toISOString(),
          total_app_opens: 0,
          login_attempts: 0,
          failed_login_attempts: 0
        };
        
        // Only add tenant_id if it exists
        if (tenant?.id) {
          farmerData.tenant_id = tenant.id;
        }
        
        const { data: newFarmer, error: insertError } = await supabase
          .from('farmers')
          .insert(farmerData)
          .select()
          .single();

        if (insertError) {
          console.error('Error creating farmer:', insertError);
          throw insertError;
        }
        
        // Create user profile
        const profileData: any = {
          id: newFarmer.id,
          farmer_id: newFarmer.id,
          mobile_number: mobile,
          preferred_language: localStorage.getItem('i18nextLng') as any || 'hi',
          is_profile_complete: false
        };
        
        // Only add tenant_id if it exists
        if (tenant?.id) {
          profileData.tenant_id = tenant.id;
        }
        
        await supabase
          .from('user_profiles')
          .insert(profileData);

        localStorage.setItem('authMobile', mobile);
        localStorage.setItem('farmerId', newFarmer.id);
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
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-primary/10 flex items-center justify-center">
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
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-primary/10 flex flex-col items-center justify-center p-4">
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
                {mode === 'register' ? t('auth.createAccount') : t('common.continue')}
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