import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useTenant } from '@/contexts/TenantContext';
import { Loader2, Phone, ArrowLeft, WifiOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { localDB } from '@/services/localDB';
import { offlineAuthService } from '@/services/offlineAuthService';
import { farmerAuthService } from '@/services/farmerAuthService';

export default function MobileAuth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const [mobile, setMobile] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const isOnline = useOfflineStatus();

  // Wait for tenant to load
  useEffect(() => {
    if (!tenantLoading) {
      setIsReady(true);
    }
  }, [tenantLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!mobile || mobile.length < 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    // Allow offline mode even if tenant is still loading
    if (!isReady && isOnline) {
      setError('Application is still loading. Please wait...');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Checking farmer with mobile:', mobile, 'tenant_id:', tenant?.id, 'isOnline:', isOnline);
      
      let farmer = null;
      
      // OFFLINE-FIRST: Always check local database first
      console.log('🔍 [MobileAuth] Checking local database first (offline-first approach)');
      const cachedAuth = await offlineAuthService.getCachedAuthData();
      
      if (cachedAuth && cachedAuth.farmerData?.mobile_number === mobile) {
        farmer = cachedAuth.farmerData;
        console.log('✅ [MobileAuth] Found farmer in local cache:', farmer.id);
        
        // Store needed data for PIN entry
        localStorage.setItem('authMobile', mobile);
        localStorage.setItem('farmerId', farmer.id);
        localStorage.setItem('tenantId', farmer.tenant_id || tenant?.id || '');
        navigate('/pin-auth');
        return;
      }
      
      // If offline and no cached data for this user
      if (!isOnline) {
        console.log('📴 [MobileAuth] Offline mode with no cached auth for this number');
        
        // Check if ANY cached auth exists (different user)
        if (cachedAuth) {
          setError('This mobile number is not available offline. Please use the registered number or connect to internet.');
        } else {
          setError('Cannot register new users while offline. Please connect to the internet first.');
        }
        setIsLoading(false);
        return;
      }
      
      // ONLINE: server-side existence probe. Returns no identifiers, so a
      // caller cannot enumerate farmer/tenant UUIDs from this endpoint.
      console.log('🌐 [MobileAuth] Online mode - checking account via farmer-auth');
      const maxRetries = 2;
      let lookup: { exists: boolean; requiresPinSetup: boolean } | null = null;
      let lastNetworkError: any = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          lookup = await farmerAuthService.lookup(mobile, tenant?.id);
          lastNetworkError = null;
          break;
        } catch (networkError: any) {
          lastNetworkError = networkError;
          const isNetworkErr = networkError.message?.includes('Failed to fetch') ||
                               networkError.message === 'Load failed' ||
                               networkError.name === 'TypeError';
          console.warn(`⚠️ [MobileAuth] Attempt ${attempt}/${maxRetries} failed:`, networkError.message);
          if (!isNetworkErr || attempt >= maxRetries) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (lastNetworkError || !lookup) {
        console.log('⚠️ [MobileAuth] All online attempts failed, checking offline cache');
        if (cachedAuth && cachedAuth.farmerData?.mobile_number === mobile) {
          localStorage.setItem('authMobile', mobile);
          localStorage.setItem('farmerId', cachedAuth.farmerId);
          localStorage.setItem('tenantId', cachedAuth.tenantId || tenant?.id || '');
          navigate('/pin-auth');
          return;
        }
        setError('Network connection is weak. Please move to an area with better signal and try again.');
        setIsLoading(false);
        return;
      }

      localStorage.setItem('authMobile', mobile);
      localStorage.setItem('tenantId', tenant?.id || '');
      localStorage.removeItem('farmerId');

      if (lookup.exists && !lookup.requiresPinSetup) {
        localStorage.removeItem('isNewRegistration');
        localStorage.removeItem('requiresCurrentPin');
        navigate('/pin-auth');
      } else if (lookup.exists) {
        // Account exists but has never had a PIN — first-time PIN setup.
        localStorage.removeItem('isNewRegistration');
        localStorage.removeItem('requiresCurrentPin');
        navigate('/set-pin');
      } else {
        // New account: the farmer row is created server-side together with the
        // PIN, so nothing is written until /set-pin completes.
        localStorage.setItem('isNewRegistration', 'true');
        localStorage.setItem('registerMobile', mobile);
        localStorage.removeItem('requiresCurrentPin');
        navigate('/set-pin');
      }
    } catch (err: any) {
      console.error('Error in mobile auth:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while tenant is loading
  if (tenantLoading || !isReady) {
    return (
      <div className="min-h-mobile-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center">
        <Card className="p-8">
          <div className="flex items-center space-x-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-muted-foreground">Loading...</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-mobile-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/language-selection')}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="text-center space-y-2">
            <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
              <Phone className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {t('auth.enterPhone')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('auth.enterPhoneDescription')}
            </p>
          </div>
        </div>

        {/* Offline indicator */}
        {!isOnline && (
          <Alert className="border-yellow-500 bg-yellow-50">
            <WifiOff className="h-4 w-4" />
            <AlertDescription className="text-yellow-800">
              {t('auth.offlineMode')}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">
              {t('auth.mobileNumber')}
            </label>
            <div className="mt-2 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                +91
              </span>
              <Input
                type="tel"
                placeholder="9876543210"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="pl-12"
                maxLength={10}
                required
                disabled={isLoading}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('auth.mobileHint')}
            </p>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12" 
            disabled={isLoading || mobile.length < 10}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {t('auth.checking')}
              </>
            ) : (
              t('auth.continue')
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}