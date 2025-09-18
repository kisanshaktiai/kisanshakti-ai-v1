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

export default function SetPin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setUser, setSession, createSession } = useAuthStore();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'set' | 'confirm'>('set');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mobile = localStorage.getItem('authMobile');
  const farmerId = localStorage.getItem('farmerId');
  const tenantId = localStorage.getItem('tenantId');
  
  // Ensure we have all required data
  useEffect(() => {
    if (!mobile || !farmerId || !tenantId) {
      navigate('/auth');
    }
  }, [mobile, farmerId, tenantId, navigate]);

  const handlePinComplete = async () => {
    if (step === 'set') {
      if (pin.length === 4) {
        setStep('confirm');
        setError(null);
      }
    } else {
      if (confirmPin !== pin) {
        setError('PINs do not match. Please try again.');
        setConfirmPin('');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // MULTI-TENANT UPDATE: Ensure we update the correct farmer in the correct tenant
        // First, get the temp mobile from metadata
        const { data: farmerData } = await supabase
          .from('farmers')
          .select('metadata')
          .eq('id', farmerId)
          .eq('tenant_id', tenantId)
          .single();
        
        const tempMobile = (farmerData?.metadata as any)?.temp_mobile || mobile;
        
        // Now update with both mobile and PIN together to satisfy constraint
        const { data: farmer, error: updateError } = await supabase
          .from('farmers')
          .update({
            mobile_number: tempMobile, // Set mobile number now with PIN
            pin: pin, // In production, store hashed PIN
            pin_hash: pin, // This should be properly hashed
            pin_updated_at: new Date().toISOString(),
            last_login_at: new Date().toISOString(),
            total_app_opens: 1,
            metadata: {} // Clear temp mobile from metadata
          })
          .eq('id', farmerId)
          .eq('tenant_id', tenantId) // CRITICAL: Ensure tenant isolation
          .select()
          .single();

        if (updateError) {
          throw updateError;
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
        
        navigate('/app');
      } catch (err: any) {
        console.error('Error setting PIN:', err);
        setError(err.message || 'Something went wrong. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-earth flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (step === 'confirm') {
                setStep('set');
                setConfirmPin('');
              } else {
                navigate('/mobile-auth');
              }
            }}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="text-center space-y-2">
            <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {step === 'set' ? 'Set Your PIN' : 'Confirm Your PIN'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === 'set' 
                ? 'Create a 4-digit PIN to secure your account'
                : 'Re-enter your PIN to confirm'}
            </p>
            <p className="text-xs text-muted-foreground">
              Mobile: +91 {mobile}
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="flex justify-center">
            <InputOTP
              maxLength={4}
              value={step === 'set' ? pin : confirmPin}
              onChange={(value) => {
                if (step === 'set') {
                  setPin(value);
                  if (value.length === 4) {
                    handlePinComplete();
                  }
                } else {
                  setConfirmPin(value);
                  if (value.length === 4) {
                    handlePinComplete();
                  }
                }
              }}
              disabled={isLoading}
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
              <span className="text-sm">Setting up your account...</span>
            </div>
          )}

          <div className="text-center text-xs text-muted-foreground">
            <p>Remember this PIN. You'll need it to login next time.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}