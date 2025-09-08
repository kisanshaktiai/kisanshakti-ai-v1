import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useTenantStore } from '@/stores/tenantStore';
import { Loader2, Phone, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function MobileAuth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenant } = useTenantStore();
  const [mobile, setMobile] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobile || mobile.length < 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check if farmer exists with this mobile number
      const { data: farmer, error: fetchError } = await supabase
        .from('farmers')
        .select('id, mobile_number, pin_hash, tenant_id')
        .eq('mobile_number', mobile)
        .eq('tenant_id', tenant?.id || '')
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      if (farmer) {
        // Farmer exists, navigate to PIN entry
        localStorage.setItem('authMobile', mobile);
        localStorage.setItem('farmerId', farmer.id);
        navigate('/pin-auth');
      } else {
        // New farmer, create entry
        const { data: newFarmer, error: insertError } = await supabase
          .from('farmers')
          .insert({
            mobile_number: mobile,
            tenant_id: tenant?.id || 'default',
            language_preference: localStorage.getItem('i18nextLng') || 'hi',
            is_active: true,
            app_install_date: new Date().toISOString(),
            total_app_opens: 0,
            login_attempts: 0,
            failed_login_attempts: 0
          })
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }

        // Also create user profile
        await supabase
          .from('user_profiles')
          .insert({
            id: newFarmer.id,
            farmer_id: newFarmer.id,
            mobile_number: mobile,
            tenant_id: tenant?.id || 'default',
            preferred_language: localStorage.getItem('i18nextLng') as any || 'hi',
            is_profile_complete: false
          });

        localStorage.setItem('authMobile', mobile);
        localStorage.setItem('farmerId', newFarmer.id);
        navigate('/set-pin');
      }
    } catch (err: any) {
      console.error('Error checking farmer:', err);
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
              Enter your mobile number to continue
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">
              Mobile Number
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
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              We'll use this number to identify you
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
                Checking...
              </>
            ) : (
              'Continue'
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}