import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { Loader2, Lock, ArrowLeft, WifiOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useTenant } from '@/contexts/TenantContext';
import { offlineAuthService } from '@/services/offlineAuthService';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { toast } from '@/hooks/use-toast';

export default function PinAuth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setUser, setSession, session } = useAuthStore();
  const { setStep } = useAuthFlowStore();
  const { tenant } = useTenant();
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const isOnline = useOfflineStatus();
  const [isOffline, setIsOffline] = useState(false);
  
  const mobile = localStorage.getItem('authMobile');
  const farmerId = localStorage.getItem('farmerId');
  const tenantId = localStorage.getItem('tenantId');
  const maskedMobile = mobile ? `${mobile.slice(0, 2)}****${mobile.slice(-2)}` : '';
  
  // Ensure we have all required data
  useEffect(() => {
    if (!mobile || !farmerId || !tenantId) {
      navigate('/auth');
    }
  }, [mobile, farmerId, tenantId, navigate]);

  const handlePinComplete = async (value: string) => {
    if (value.length !== 4) return;
    
    setIsLoading(true);
    setError(null);

    try {
      // Use offline-first authentication
      console.log('Attempting authentication with offline fallback...');
      const authResult = await offlineAuthService.authenticateWithFallback(
        mobile!,
        value,
        farmerId!,
        tenantId!
      );

      if (!authResult.success) {
        throw new Error(authResult.error || 'Authentication failed');
      }

      const farmer = authResult.farmerData;
      const profileData = authResult.profileData;

      // If we're offline, show a notification
      if (authResult.isOffline) {
        toast({
          title: 'Offline Mode',
          description: 'You are logged in offline. Data will sync when connection is restored.',
          variant: 'default',
        });
      } else {
        // Update login stats only if online
        try {
          await supabase
            .from('farmers')
            .update({
              last_login_at: new Date().toISOString(),
              last_app_open: new Date().toISOString(),
              total_app_opens: (farmer.total_app_opens || 0) + 1,
              failed_login_attempts: 0
            })
            .eq('id', farmerId);
        } catch (error) {
          console.log('Could not update login stats, will sync later');
        }
        
        // Cache auth data for offline use
        await offlineAuthService.cacheAuthData(
          farmer.id,
          farmer.tenant_id,
          farmer.mobile_number,
          value,
          farmer,
          profileData
        );
      }

      // Update existing session or create new one
      const updatedSession = session ? {
        ...session,
        isPinVerified: true,
        isOffline: authResult.isOffline
      } : {
        farmerId: farmer.id,
        tenantId: farmer.tenant_id,
        mobile: farmer.mobile_number,
        token: `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days for offline
        isPinVerified: true,
        isOffline: authResult.isOffline
      };

      // Set session and user in store with complete profile data
      console.log('PIN verified successfully, setting session:', updatedSession);
      setSession(updatedSession);
      setUser({
          id: farmer.id,
          phone: farmer.mobile_number,
          name: profileData?.full_name || farmer.farmer_name || farmer.farmer_code || 'Farmer',
          role: 'farmer',
          language: farmer.language_preference || 'hi',
          tenantId: farmer.tenant_id,
          farmerCode: farmer.farmer_code,
          farmerName: farmer.farmer_name,
          sessionToken: updatedSession.token,
          lastLoginAt: new Date().toISOString(),
          // Profile fields
          fullName: profileData?.full_name || '',
          displayName: profileData?.display_name || '',
          dateOfBirth: profileData?.date_of_birth || '',
          gender: profileData?.gender || '',
          village: profileData?.village || '',
          taluka: profileData?.taluka || '',
          district: profileData?.district || '',
          state: profileData?.state || '',
          pincode: profileData?.pincode || '',
          preferredLanguage: profileData?.preferred_language || farmer.language_preference || 'hi',
          avatarUrl: profileData?.avatar_url || '',
          // Farm details
          totalLandAcres: farmer.total_land_acres || profileData?.total_land_acres || 0,
          primaryCrops: farmer.primary_crops || profileData?.primary_crops || [],
          farmingExperienceYears: farmer.farming_experience_years || profileData?.farming_experience_years || 0,
          farmType: farmer.farm_type || '',
          hasTractor: farmer.has_tractor || profileData?.has_tractor || false,
          hasIrrigation: farmer.has_irrigation || profileData?.has_irrigation || false,
          irrigationType: farmer.irrigation_type || '',
          hasStorage: farmer.has_storage || profileData?.has_storage || false,
          annualIncomeRange: farmer.annual_income_range || profileData?.annual_income_range || ''
        });

      // Update Supabase client headers for RLS to work with custom auth
      const { updateSupabaseHeaders, waitForHeaders, supabaseWithAuth } = await import('@/integrations/supabase/client');
      updateSupabaseHeaders(farmer.id, farmer.tenant_id);
      
      // CRITICAL: Wait for headers to be ready
      console.log('⏳ [PinAuth] Waiting for headers...');
      await waitForHeaders();
      console.log('✅ [PinAuth] Headers ready');
      
      // VERIFY headers are working before navigating
      console.log('🔍 [PinAuth] Testing data access...');
      try {
        const testQuery = await supabaseWithAuth(farmer.id, farmer.tenant_id)
          .from('lands')
          .select('count')
          .limit(1);

        if (testQuery.error) {
          console.error('❌ [PinAuth] Data access test failed:', testQuery.error);
          throw new Error('Authentication succeeded but data access failed. Please contact support.');
        }

        console.log('✅ [PinAuth] Data access verified');
      } catch (testError) {
        console.error('❌ [PinAuth] Data access verification failed:', testError);
        throw new Error('Cannot verify data access. Please try again.');
      }

      // Clear temp storage but keep session data
      localStorage.removeItem('authMobile');
      localStorage.removeItem('farmerId');
      
      // Set step and force navigation
      setStep('dashboard');
      console.log('Navigating to dashboard...');
      
      // Use setTimeout to ensure state updates are processed
      setTimeout(() => {
        navigate('/app', { replace: true });
      }, 100);
    } catch (err: any) {
      console.error('Error verifying PIN:', err);
      setError(err.message || 'Authentication failed. Please try again.');
      setPin('');
      
      // Increment attempts
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      
      if (newAttempts >= 3) {
        setError(t('auth.tooManyAttempts') || 'Too many failed attempts. Please try again later.');
        setTimeout(() => navigate('/auth'), 3000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Get branding
  const brandName = tenant?.branding?.company_name || tenant?.name;

  return (
    <div className="min-h-screen bg-gradient-primary flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6 shadow-xl">
        {/* Header */}
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/auth')}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.back')}
          </Button>
          
          <div className="text-center space-y-3">
            <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center animate-scale-in">
              <Lock className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                {t('auth.enterPin')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('auth.enterPinDescription')} +91 {maskedMobile}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!isOnline && (
          <Alert>
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              You are offline. Using cached credentials.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="flex justify-center">
            <InputOTP
              maxLength={4}
              value={pin}
              onChange={(value) => {
                setPin(value);
                if (value.length === 4) {
                  handlePinComplete(value);
                }
              }}
              disabled={isLoading || attempts >= 3}
              autoFocus
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center space-x-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{t('auth.verifying')}</span>
            </div>
          )}

          <div className="text-center space-y-2">
            <Button
              variant="link"
              onClick={() => navigate('/forgot-pin')}
              className="text-sm"
              disabled={attempts >= 3}
            >
              {t('auth.forgotPin')}
            </Button>
            
            {attempts > 0 && attempts < 3 && (
              <p className="text-xs text-muted-foreground">
                {3 - attempts} {t('auth.attemptsRemaining')}
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}