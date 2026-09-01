import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Loader2, Shield, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { farmerAuthService } from '@/services/farmerAuthService';

export default function SetPin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setUser, setSession, createSession } = useAuthStore();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'set' | 'confirm'>('set');
  // Required when an existing farmer changes an already-set PIN.
  const [currentPin, setCurrentPin] = useState('');
  const requiresCurrentPin = localStorage.getItem('requiresCurrentPin') === 'true';
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Check if this is a new registration or existing farmer setting PIN
  const isNewRegistration = localStorage.getItem('isNewRegistration') === 'true';
  const registerMobile = localStorage.getItem('registerMobile');
  const mobile = registerMobile || localStorage.getItem('authMobile');
  const farmerId = localStorage.getItem('farmerId');
  const tenantId = localStorage.getItem('tenantId');
  
  // Ensure we have required data
  useEffect(() => {
    if (!mobile || !tenantId) {
      navigate('/auth');
    }
  }, [mobile, tenantId, isNewRegistration, navigate]);

  const handlePinComplete = async () => {
    if (step === 'set') {
      if (requiresCurrentPin && currentPin.length !== 4) {
        setError(t('auth.enterCurrentPin') || 'Enter your current PIN to continue');
        return;
      }
      if (pin.length !== 4) {
        setError(t('auth.pinMustBe4Digits') || 'PIN must be 4 digits');
        return;
      }
      setStep('confirm');
      setError(null);
      return;
    }
    
    // Confirm step - validate PINs match
    if (confirmPin !== pin) {
      setError(t('auth.pinMismatch') || 'PINs do not match. Please try again.');
      setConfirmPin('');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Credential writes happen server-side only (farmer-auth edge function).
      // The client no longer inserts farmers or writes pin_hash directly.
      const language = localStorage.getItem('i18nextLng') || 'hi';
      let result;

      if (isNewRegistration) {
        result = await farmerAuthService.register(mobile!, tenantId!, pin, language);
      } else {
        // Existing farmer: server requires the current PIN or a live session.
        result = await farmerAuthService.changePin(
          mobile!,
          tenantId!,
          pin,
          currentPin || undefined
        );
      }

      const farmer = result.farmer;
      localStorage.setItem('farmerId', farmer.id);

      // Create authenticated session
      const session = createSession(farmer.id, farmer.tenant_id, farmer.mobile_number);
      
      // Mark session as PIN verified
      setSession({
        ...session,
        isPinVerified: true
      });
      
      // Set user in store with authentication flag
      setUser({
        id: farmer.id,
        phone: farmer.mobile_number,
        name: farmer.farmer_code || 'Farmer',
        role: 'farmer',
        language: farmer.language_preference || 'hi',
        tenantId: farmer.tenant_id,
        farmerCode: farmer.farmer_code,
        sessionToken: result.session.token,
        lastLoginAt: new Date().toISOString()
      });
      
      // Clear temp storage
      localStorage.removeItem('authMobile');
      localStorage.removeItem('farmerId');
      localStorage.removeItem('requiresCurrentPin');
      localStorage.removeItem('isNewRegistration');
      localStorage.removeItem('registerMobile');
      
      navigate('/app');
    } catch (err: any) {
      console.error('Error setting PIN:', err);
      setError(err.message || t('common.somethingWentWrong') || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'confirm') {
      setStep('set');
      setConfirmPin('');
      setError(null);
    } else {
      navigate('/auth');
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
            onClick={handleBack}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('auth.back')}
          </Button>
          
          <div className="text-center space-y-3">
            <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center animate-fade-in">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {isNewRegistration 
                ? (step === 'set' ? t('auth.createPin') : t('auth.confirmPin'))
                : (step === 'set' ? t('auth.setPin') : t('auth.confirmPin'))}
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === 'set' 
                ? t('auth.createPinDescription')
                : t('auth.confirmPinDescription')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('auth.mobile')}: +91 {mobile}
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Current PIN — required to replace an existing PIN */}
          {requiresCurrentPin && step === 'set' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t('auth.currentPin') || 'Current PIN'}
              </label>
              <div className="flex justify-center">
                <InputOTP maxLength={4} value={currentPin} onChange={setCurrentPin} disabled={isLoading}>
                  <InputOTPGroup className="gap-2">
                    <InputOTPSlot index={0} mask className="w-14 h-14 text-lg" />
                    <InputOTPSlot index={1} mask className="w-14 h-14 text-lg" />
                    <InputOTPSlot index={2} mask className="w-14 h-14 text-lg" />
                    <InputOTPSlot index={3} mask className="w-14 h-14 text-lg" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
          )}

          {/* PIN Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {step === 'set' ? t('auth.enterPin') : t('auth.reEnterPin')}
            </label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={step === 'set' ? pin : confirmPin}
                onChange={(value) => {
                  if (step === 'set') {
                    setPin(value);
                  } else {
                    setConfirmPin(value);
                  }
                }}
                disabled={isLoading}
              >
                <InputOTPGroup className="gap-2">
                  <InputOTPSlot index={0} mask className="w-14 h-14 text-lg" />
                  <InputOTPSlot index={1} mask className="w-14 h-14 text-lg" />
                  <InputOTPSlot index={2} mask className="w-14 h-14 text-lg" />
                  <InputOTPSlot index={3} mask className="w-14 h-14 text-lg" />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {step === 'set' ? (
              <Button 
                onClick={handlePinComplete}
                disabled={pin.length !== 4 || isLoading}
                className="w-full h-12 text-base"
              >
                {t('auth.continue')}
              </Button>
            ) : (
              <Button 
                onClick={handlePinComplete}
                disabled={confirmPin.length !== 4 || isLoading}
                className="w-full h-12 text-base"
                variant={isNewRegistration ? "default" : "default"}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {isNewRegistration ? t('auth.registering') : t('auth.settingPin')}
                  </>
                ) : (
                  isNewRegistration ? t('auth.register') : t('auth.setPin')
                )}
              </Button>
            )}
          </div>

          {/* Helper Text */}
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('auth.pinHelperText')}
            </p>
            {isNewRegistration && (
              <p className="text-xs text-muted-foreground font-medium">
                {t('auth.registeringFor') || 'Registering for'}: {mobile}
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}