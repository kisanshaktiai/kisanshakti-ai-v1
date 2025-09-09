import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { Loader2, Lock, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useTenantStore } from '@/stores/tenantStore';

export default function PinAuth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const { setStep } = useAuthFlowStore();
  const { tenant } = useTenantStore();
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  
  const mobile = localStorage.getItem('authMobile');
  const farmerId = localStorage.getItem('farmerId');
  const maskedMobile = mobile ? `${mobile.slice(0, 2)}****${mobile.slice(-2)}` : '';

  const handlePinComplete = async (value: string) => {
    if (value.length !== 4) return;
    
    setIsLoading(true);
    setError(null);

    try {
      // Verify PIN
      const { data: farmer, error: fetchError } = await supabase
        .from('farmers')
        .select('*')
        .eq('id', farmerId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // In production, use proper PIN hashing and verification
      // For demo, we'll do a simple check
      if (farmer.pin === value || farmer.pin_hash === value) {
        // Update login stats
        await supabase
          .from('farmers')
          .update({
            last_login_at: new Date().toISOString(),
            last_app_open: new Date().toISOString(),
            total_app_opens: (farmer.total_app_opens || 0) + 1,
            failed_login_attempts: 0
          })
          .eq('id', farmerId);

        // Set user in store
        setUser({
          id: farmer.id,
          phone: farmer.mobile_number,
          name: farmer.farmer_code || 'Farmer',
          role: 'farmer',
          language: farmer.language_preference || 'hi',
          tenantId: farmer.tenant_id
        });

        // Clear temp storage
        localStorage.removeItem('authMobile');
        localStorage.removeItem('farmerId');
        
        setStep('dashboard');
        navigate('/');
      } else {
        // Update failed attempts
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        
        await supabase
          .from('farmers')
          .update({
            failed_login_attempts: (farmer.failed_login_attempts || 0) + 1,
            last_failed_login: new Date().toISOString()
          })
          .eq('id', farmerId);
        
        if (newAttempts >= 3) {
          setError(t('auth.tooManyAttempts') || 'Too many failed attempts. Please try again later.');
          setTimeout(() => navigate('/auth'), 3000);
        } else {
          setError(t('auth.incorrectPin') || `Incorrect PIN. ${3 - newAttempts} attempts remaining.`);
        }
        setPin('');
      }
    } catch (err: any) {
      console.error('Error verifying PIN:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Get branding
  const brandName = tenant?.whiteLabel?.brand_identity?.company_name || tenant?.name;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-primary/10 flex flex-col items-center justify-center p-4">
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