import { useState, useEffect } from 'react';
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
  const { tenant, isLoading: tenantLoading } = useTenantStore();
  const [mobile, setMobile] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

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

    if (!isReady) {
      setError('Application is still loading. Please wait...');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Checking farmer with mobile:', mobile, 'tenant_id:', tenant?.id);
      
      // Build query
      let query = supabase
        .from('farmers')
        .select('id, mobile_number, pin, pin_hash, tenant_id')
        .eq('mobile_number', mobile);
      
      // Only add tenant filter if tenant exists
      if (tenant?.id) {
        query = query.eq('tenant_id', tenant.id);
      }
      
      const { data: farmer, error: fetchError } = await query.maybeSingle();

      if (fetchError) {
        console.error('Error fetching farmer:', fetchError);
        throw fetchError;
      }

      if (farmer) {
        console.log('Farmer found:', farmer.id);
        // Farmer exists, navigate to PIN entry
        localStorage.setItem('authMobile', mobile);
        localStorage.setItem('farmerId', farmer.id);
        navigate('/pin-auth');
      } else {
        console.log('Creating new farmer with tenant_id:', tenant?.id);
        // New farmer, create entry
        const farmerData: any = {
          mobile_number: mobile,
          language_preference: localStorage.getItem('i18nextLng') || 'hi',
          is_active: true,
          app_install_date: new Date().toISOString(),
          total_app_opens: 0,
          login_attempts: 0,
          failed_login_attempts: 0
        };
        
        // Only add tenant_id if it exists
        if (tenant?.id) {
          farmerData.tenant_id = tenant.id;
        }
        
        const { data: newFarmer, error: insertError } = await supabase
          .from('farmers')
          .insert(farmerData)
          .select()
          .single();

        if (insertError) {
          console.error('Error creating farmer:', insertError);
          throw insertError;
        }

        console.log('New farmer created:', newFarmer.id);
        
        // Create user profile
        const profileData: any = {
          id: newFarmer.id,
          farmer_id: newFarmer.id,
          mobile_number: mobile,
          preferred_language: localStorage.getItem('i18nextLng') as any || 'hi',
          is_profile_complete: false
        };
        
        // Only add tenant_id if it exists
        if (tenant?.id) {
          profileData.tenant_id = tenant.id;
        }
        
        await supabase
          .from('user_profiles')
          .insert(profileData);

        localStorage.setItem('authMobile', mobile);
        localStorage.setItem('farmerId', newFarmer.id);
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
      <div className="min-h-screen bg-gradient-earth flex items-center justify-center">
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
                disabled={isLoading}
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