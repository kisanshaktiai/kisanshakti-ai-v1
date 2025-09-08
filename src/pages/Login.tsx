import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/authStore';
import { Loader2, Phone } from 'lucide-react';
import { isSupabaseConfigured } from '@/utils/supabase';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, error } = useAuthStore();
  
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');

  const from = location.state?.from?.pathname || '/';

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    
    // For demo, move to OTP step
    setStep('otp');
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;

    // For demo purposes, bypass actual auth
    await login(phone, otp);
    navigate(from, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-earth">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-20 h-20 bg-gradient-primary rounded-full flex items-center justify-center mb-4">
            <Phone className="w-10 h-10 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">{t('auth.welcome')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!isSupabaseConfigured() && (
            <Alert className="mb-4">
              <AlertDescription>
                Supabase not configured. Using demo mode. Connect Supabase for full authentication.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">
                  {t('auth.enterPhone')}
                </label>
                <Input
                  type="tel"
                  placeholder="+91 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-2"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {t('auth.sendOtp')}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">
                  {t('auth.enterOtp')}
                </label>
                <Input
                  type="text"
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="mt-2"
                  maxLength={6}
                  required
                />
                <p className="text-xs text-muted-foreground mt-2">
                  OTP sent to {phone}
                </p>
              </div>
              <div className="space-y-2">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {t('auth.verify')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep('phone')}
                >
                  {t('common.back')}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}