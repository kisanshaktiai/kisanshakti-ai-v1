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
import CryptoJS from 'crypto-js';

export default function SetPin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setUser, setSession, createSession } = useAuthStore();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'set' | 'confirm'>('set');
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
    // For existing farmers, we need farmerId
    if (!isNewRegistration && !farmerId) {
      navigate('/auth');
    }
  }, [mobile, farmerId, tenantId, isNewRegistration, navigate]);

  const hashPin = (pin: string): string => {
    const SALT = 'kisan_shakti_2024';
    return CryptoJS.SHA256(pin + SALT).toString();
  };

  const handlePinComplete = async () => {
    if (step === 'set') {
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
      let farmer;
      
      if (isNewRegistration) {
        // Get the last farmer code for sequential generation
        const { data: lastFarmer } = await supabase
          .from('farmers')
          .select('farmer_code')
          .eq('tenant_id', tenantId!)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Generate sequential farmer code
        let farmerCode: string;
        const tenantPrefix = localStorage.getItem('tenantPrefix') || 'KIS';
        
        if (lastFarmer?.farmer_code) {
          // Extract number from last code and increment
          const match = lastFarmer.farmer_code.match(/(\D+)(\d+)/);
          if (match) {
            const prefix = match[1];
            const number = parseInt(match[2], 10) + 1;
            farmerCode = `${prefix}${number.toString().padStart(6, '0')}`;
          } else {
            farmerCode = `${tenantPrefix}000001`;
          }
        } else {
          // First farmer for this tenant
          farmerCode = `${tenantPrefix}000001`;
        }

        // Hash the PIN for secure storage
        const pinHash = hashPin(pin);
        
        const farmerData = {
          mobile_number: mobile!,
          pin_hash: pinHash, // Store hashed PIN
          pin: pin, // Store plain PIN for development/debugging (remove in production)
          tenant_id: tenantId!,
          farmer_code: farmerCode,
          language_preference: localStorage.getItem('i18nextLng') || 'hi',
          is_active: true,
          app_install_date: new Date().toISOString(),
          total_app_opens: 1,
          login_attempts: 0,
          failed_login_attempts: 0,
          last_login_at: new Date().toISOString(),
          pin_updated_at: new Date().toISOString()
        };
        
        const { data: newFarmer, error: insertError } = await supabase
          .from('farmers')
          .insert(farmerData)
          .select()
          .single();
        
        if (insertError) {
          // Handle duplicate mobile number
          if (insertError.code === '23505' || insertError.message?.includes('duplicate')) {
            setError(t('auth.mobileAlreadyRegistered') || 'This mobile number is already registered');
            setTimeout(() => navigate('/auth'), 2000);
            return;
          }
          throw insertError;
        }
        
        farmer = newFarmer;
        
        // Create user profile with mobile and farmer_code
        await supabase
          .from('user_profiles')
          .insert({
            id: farmer.id,
            farmer_id: farmer.id,
            tenant_id: farmer.tenant_id,
            mobile_number: farmer.mobile_number,
            farmer_code: farmerCode,
            preferred_language: farmer.language_preference as any,
            is_profile_complete: false
          });
        
        // Store farmer ID for session
        localStorage.setItem('farmerId', farmer.id);
        
      } else {
        // EXISTING FARMER: Update PIN with hash
        const pinHash = hashPin(pin);
        
        const { data: updatedFarmer, error: updateError } = await supabase
          .from('farmers')
          .update({
            pin_hash: pinHash, // Store hashed PIN
            pin: pin, // Store plain PIN for development/debugging (remove in production)
            pin_updated_at: new Date().toISOString(),
            last_login_at: new Date().toISOString(),
            total_app_opens: 1
          })
          .eq('id', farmerId)
          .eq('tenant_id', tenantId)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }
        
        farmer = updatedFarmer;
        
        // Update user profile with mobile and farmer_code if needed
        await supabase
          .from('user_profiles')
          .update({
            mobile_number: farmer.mobile_number,
            farmer_code: farmer.farmer_code
          })
          .eq('farmer_id', farmer.id);
      }

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
        sessionToken: session.token,
        lastLoginAt: new Date().toISOString()
      });
      
      // Clear temp storage
      localStorage.removeItem('authMobile');
      localStorage.removeItem('farmerId');
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
    <div className="min-h-screen bg-gradient-primary flex flex-col items-center justify-center p-4">
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
            {t('common.back')}
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
                ? t('auth.createPinDescription') || 'Create a 4-digit PIN to secure your account'
                : t('auth.confirmPinDescription') || 'Re-enter your PIN to confirm'}
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
                  <InputOTPSlot index={0} className="w-14 h-14 text-lg" />
                  <InputOTPSlot index={1} className="w-14 h-14 text-lg" />
                  <InputOTPSlot index={2} className="w-14 h-14 text-lg" />
                  <InputOTPSlot index={3} className="w-14 h-14 text-lg" />
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
                {t('common.continue')}
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
              {t('auth.pinHelperText') || 'Remember this PIN. You\'ll need it to login next time.'}
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