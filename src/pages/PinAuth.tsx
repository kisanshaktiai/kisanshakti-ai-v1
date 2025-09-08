import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Loader2, Lock, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

export default function PinAuth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mobile = localStorage.getItem('authMobile');
  const farmerId = localStorage.getItem('farmerId');

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
        
        navigate('/');
      } else {
        // Update failed attempts
        await supabase
          .from('farmers')
          .update({
            failed_login_attempts: (farmer.failed_login_attempts || 0) + 1,
            last_failed_login: new Date().toISOString()
          })
          .eq('id', farmerId);
        
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch (err: any) {
      console.error('Error verifying PIN:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
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
            onClick={() => navigate('/mobile-auth')}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="text-center space-y-2">
            <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
              <Lock className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Enter Your PIN
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your 4-digit PIN for +91 {mobile}
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
              value={pin}
              onChange={(value) => {
                setPin(value);
                if (value.length === 4) {
                  handlePinComplete(value);
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
              <span className="text-sm">Verifying...</span>
            </div>
          )}

          <div className="text-center">
            <Button
              variant="link"
              onClick={() => navigate('/forgot-pin')}
              className="text-sm"
            >
              Forgot PIN?
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}