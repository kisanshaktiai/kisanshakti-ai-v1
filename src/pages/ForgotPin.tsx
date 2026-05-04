import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, KeyRound, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { offlineAuthService } from '@/services/offlineAuthService';

/**
 * Forgot PIN flow for farmers (custom auth).
 * - Confirms the mobile belongs to an existing farmer in the active tenant.
 * - Clears any cached offline auth so the new PIN is required next login.
 * - Routes the farmer to /set-pin in reset mode (existing-farmer branch).
 *
 * Does NOT touch Supabase Auth (used only by SaaS admin / tenants).
 */
export default function ForgotPin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenant } = useTenant();

  const cachedMobile = localStorage.getItem('authMobile') || '';
  const [mobile, setMobile] = useState(cachedMobile);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant?.id) return;
  }, [tenant?.id]);

  const handleContinue = async () => {
    setError(null);

    const cleaned = mobile.replace(/\D/g, '');
    if (cleaned.length !== 10) {
      setError(t('auth.invalidMobile') || 'Please enter a valid 10-digit mobile number');
      return;
    }

    if (!tenant?.id) {
      setError(t('auth.tenantNotLoaded') || 'Application is still loading. Please wait...');
      return;
    }

    if (!navigator.onLine) {
      setError(t('auth.noAccount') || 'PIN reset requires an internet connection.');
      return;
    }

    setIsLoading(true);
    try {
      const { data: farmer, error: fetchError } = await supabase
        .from('farmers')
        .select('id, mobile_number, tenant_id, farmer_code')
        .eq('mobile_number', cleaned)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!farmer) {
        setError(t('auth.accountNotFound') || 'No account found for this mobile number.');
        return;
      }

      // Clear cached offline auth so the previous PIN is invalidated locally.
      await offlineAuthService.clearCachedAuth();

      // Hand off to SetPin in existing-farmer (reset) mode.
      localStorage.setItem('authMobile', cleaned);
      localStorage.setItem('farmerId', farmer.id);
      localStorage.setItem('tenantId', farmer.tenant_id);
      localStorage.removeItem('isNewRegistration');
      localStorage.removeItem('registerMobile');

      navigate('/set-pin');
    } catch (err: any) {
      console.error('[ForgotPin] lookup failed:', err);
      setError(err.message || t('auth.serverError') || 'Server error. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-mobile-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6 shadow-xl">
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/pin-auth')}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('auth.back')}
          </Button>

          <div className="text-center space-y-3">
            <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center animate-scale-in">
              <KeyRound className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                {t('auth.forgotPin')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('auth.contactSupport') || 'Confirm your mobile number to reset your PIN.'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('auth.mobileNumber')}
            </label>
            <Input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
              placeholder="9876543210"
              disabled={isLoading}
              className="h-12 text-base"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {t('auth.mobileHint')}
            </p>
          </div>

          <Button
            onClick={handleContinue}
            disabled={isLoading || mobile.length !== 10}
            className="w-full h-12 text-base"
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
        </div>
      </Card>
    </div>
  );
}
