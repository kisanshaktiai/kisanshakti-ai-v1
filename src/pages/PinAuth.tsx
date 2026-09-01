import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase, getSessionToken } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { Loader2, Lock, ArrowLeft, WifiOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useTenant } from '@/contexts/TenantContext';
import { offlineAuthService } from '@/services/offlineAuthService';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export default function PinAuth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setUser, setSession, session } = useAuthStore();
  const { setStep } = useAuthFlowStore();
  const queryClient = useQueryClient();
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
  
  // Ensure we have all required data (but allow if cached auth exists for offline)
  useEffect(() => {
    const checkRequiredData = async () => {
      if (!mobile) {
        // Check if we have cached auth for offline
        const cachedAuth = await offlineAuthService.getCachedAuthData();
        if (cachedAuth) {
          // Restore data from cache
          localStorage.setItem('authMobile', cachedAuth.mobile);
          localStorage.setItem('farmerId', cachedAuth.farmerId);
          localStorage.setItem('tenantId', cachedAuth.tenantId);
        } else {
          navigate('/auth');
        }
      }
    };
    checkRequiredData();
  }, [mobile, farmerId, navigate]);

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
        farmerId || '',
        tenantId || ''
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
        // Login stats are updated server-side by farmer-auth.
        // Cache auth data for offline use.
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
        token: getSessionToken() || `offline_${Date.now()}`,
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
      
      // VERIFY headers are working before navigating (SKIP if offline)
      if (!authResult.isOffline && isOnline) {
        console.log('🔍 [PinAuth] Testing data access...');
        try {
          const testQuery = await supabaseWithAuth(farmer.id, farmer.tenant_id)
            .from('lands')
            .select('count')
            .limit(1);

          if (testQuery.error) {
            console.error('❌ [PinAuth] Data access test failed:', testQuery.error);
            // Don't throw - allow offline access with warning
            console.warn('⚠️ [PinAuth] Continuing despite data access test failure');
          } else {
            console.log('✅ [PinAuth] Data access verified');
          }
        } catch (testError) {
          console.warn('⚠️ [PinAuth] Data access verification failed, continuing anyway:', testError);
        }
      } else {
        console.log('📴 [PinAuth] Skipping data access test - offline mode');
      }

      // Clear temp storage but keep session data
      localStorage.removeItem('authMobile');
      localStorage.removeItem('farmerId');

      // CRITICAL: nuke any stale React Query cache from a previous user/session.
      // Without this, the home screen briefly renders the previous user's data
      // (the "old view" the user reported).
      queryClient.clear();

      // Set step and navigate synchronously — headers are already awaited above,
      // so the next render of <Home/> will see authReady === true on first try.
      setStep('dashboard');
      console.log('🚀 [PinAuth] Navigating to dashboard');
      navigate('/app', { replace: true });
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

  return (
    <div className="min-h-mobile-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex flex-col items-center justify-center p-4">
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
            {t('auth.back')}
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
              {t('auth.usingCachedCredentials')}
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
                <InputOTPSlot index={0} mask />
                <InputOTPSlot index={1} mask />
                <InputOTPSlot index={2} mask />
                <InputOTPSlot index={3} mask />
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
                {t('auth.attemptsRemaining', { count: 3 - attempts })}
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}