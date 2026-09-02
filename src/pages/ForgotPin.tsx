import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Loader2, KeyRound, ArrowLeft } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { farmerAuthService } from '@/services/farmerAuthService';
import { offlineAuthService } from '@/services/offlineAuthService';
import { useAuthStore } from '@/stores/authStore';

/**
 * Forgot PIN flow for farmers (custom auth).
 *
 * Step 1 — confirm the mobile number and request a one-time SMS code.
 * Step 2 — enter the code plus a new PIN; the server verifies the code,
 *          rewrites the PIN and issues a fresh session.
 *
 * There is deliberately no path that accepts a mobile number alone, and none
 * that asks for the PIN the farmer just forgot.
 */
export default function ForgotPin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { setUser, setSession, createSession } = useAuthStore();

  const cachedMobile = localStorage.getItem('authMobile') || '';
  const [step, setStep] = useState<'mobile' | 'code'>('mobile');
  const [mobile, setMobile] = useState(cachedMobile);
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const cleanedMobile = mobile.replace(/\D/g, '');

  const sendCode = async () => {
    setError(null);
    setNotice(null);

    if (cleanedMobile.length !== 10) {
      setError(t('auth.invalidMobile') || 'Please enter a valid 10-digit mobile number');
      return;
    }
    if (!tenant?.id) {
      setError(t('auth.tenantNotLoaded') || 'Application is still loading. Please wait...');
      return;
    }
    if (!navigator.onLine) {
      setError(t('auth.resetNeedsInternet') || 'PIN reset requires an internet connection.');
      return;
    }

    setIsLoading(true);
    try {
      await farmerAuthService.requestPinReset(cleanedMobile, tenant.id);
      localStorage.setItem('authMobile', cleanedMobile);
      localStorage.setItem('tenantId', tenant.id);
      setStep('code');
      setResendIn(60);
      setNotice(t('auth.resetCodeSent') || 'We sent a 6-digit code to your mobile number.');
    } catch (err: any) {
      console.error('[ForgotPin] reset request failed:', err);
      setError(err.message || t('auth.serverError') || 'Server error. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const submitReset = async () => {
    setError(null);

    if (code.length !== 6) {
      setError(t('auth.enterResetCode') || 'Enter the 6-digit code we sent you.');
      return;
    }
    if (newPin.length !== 4) {
      setError(t('auth.pinMustBe4Digits') || 'PIN must be 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setError(t('auth.pinMismatch') || 'PINs do not match. Please try again.');
      setConfirmPin('');
      return;
    }

    setIsLoading(true);
    try {
      const result = await farmerAuthService.verifyPinReset(
        cleanedMobile,
        tenant?.id ?? null,
        code,
        newPin,
      );

      // The old PIN is gone — drop any cached offline credential for it.
      await offlineAuthService.clearCachedAuth();

      const farmer = result.farmer;
      const session = createSession(farmer.id, farmer.tenant_id, farmer.mobile_number);
      setSession({ ...session, isPinVerified: true });
      setUser({
        id: farmer.id,
        phone: farmer.mobile_number,
        name: farmer.farmer_code || 'Farmer',
        role: 'farmer',
        language: farmer.language_preference || 'hi',
        tenantId: farmer.tenant_id,
        farmerCode: farmer.farmer_code,
        sessionToken: result.session.token,
        lastLoginAt: new Date().toISOString(),
      });

      localStorage.removeItem('requiresCurrentPin');
      localStorage.removeItem('isNewRegistration');
      localStorage.removeItem('registerMobile');

      navigate('/app');
    } catch (err: any) {
      console.error('[ForgotPin] reset failed:', err);
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
            onClick={() => (step === 'code' ? setStep('mobile') : navigate('/pin-auth'))}
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
                {step === 'mobile'
                  ? (t('auth.resetEnterMobile') || 'Enter your mobile number and we will send a reset code.')
                  : (t('auth.resetEnterCode') || 'Enter the code we sent and choose a new PIN.')}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {step === 'mobile' ? (
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
              onClick={sendCode}
              disabled={isLoading || cleanedMobile.length !== 10}
              className="w-full h-12 text-base"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {t('auth.sendingResetCode') || t('auth.checking')}
                </>
              ) : (
                t('auth.sendResetCode') || t('auth.continue')
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t('auth.resetCode') || 'Reset code'}
              </label>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={setCode} disabled={isLoading}>
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} className="w-11 h-12 text-lg" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t('auth.newPin') || 'New PIN'}
              </label>
              <div className="flex justify-center">
                <InputOTP maxLength={4} value={newPin} onChange={setNewPin} disabled={isLoading}>
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <InputOTPSlot key={i} index={i} mask className="w-14 h-14 text-lg" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t('auth.reEnterPin')}
              </label>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={4}
                  value={confirmPin}
                  onChange={setConfirmPin}
                  disabled={isLoading}
                >
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <InputOTPSlot key={i} index={i} mask className="w-14 h-14 text-lg" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                onClick={submitReset}
                disabled={isLoading || code.length !== 6 || confirmPin.length !== 4}
                className="w-full h-12 text-base"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {t('auth.settingPin')}
                  </>
                ) : (
                  t('auth.resetPin') || t('auth.setPin')
                )}
              </Button>

              <Button
                variant="ghost"
                onClick={sendCode}
                disabled={isLoading || resendIn > 0}
                className="w-full"
              >
                {resendIn > 0
                  ? `${t('auth.resendCodeIn') || 'Resend code in'} ${resendIn}s`
                  : (t('auth.resendCode') || 'Resend code')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
