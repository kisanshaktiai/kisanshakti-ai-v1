import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantStore } from '@/stores/tenantStore';
import { useAuthStore } from '@/stores/authStore';
import { Loader2 } from 'lucide-react';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { tenant, fetchTenant, isLoading, error } = useTenantStore();
  const { checkAuth, isAuthenticated } = useAuthStore();

  useEffect(() => {
    const initializeApp = async () => {
      // Fetch tenant data
      await fetchTenant();
      
      // Check authentication
      await checkAuth();
      
      // Navigate after initialization
      setTimeout(() => {
        if (isAuthenticated) {
          navigate('/');
        } else {
          // Check if language is already selected
          const hasSelectedLanguage = localStorage.getItem('hasSelectedLanguage');
          if (hasSelectedLanguage) {
            navigate('/mobile-auth');
          } else {
            navigate('/language-selection');
          }
        }
      }, 2000);
    };

    initializeApp();
  }, []);

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{
        background: tenant?.settings?.theme?.primaryGradient || 
          'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary-dark)) 100%)'
      }}
    >
      <div className="text-center space-y-8">
        {/* App Icon */}
        <div className="w-32 h-32 mx-auto rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
          {tenant?.settings?.logo ? (
            <img 
              src={tenant.settings.logo} 
              alt={tenant.name}
              className="w-24 h-24 object-contain"
            />
          ) : (
            <div className="text-white text-6xl font-bold">
              {tenant?.name?.charAt(0) || 'K'}
            </div>
          )}
        </div>

        {/* App Name */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-white">
            {tenant?.name || 'KisanShakti'}
          </h1>
          <p className="text-white/80 text-lg px-8">
            {tenant?.settings?.tagline || 'Empowering Farmers with Technology'}
          </p>
        </div>

        {/* Loading Indicator or Error */}
        {error ? (
          <div className="text-yellow-200 text-sm px-8">
            {error}
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-2 text-white/60">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        )}
      </div>

      {/* Version */}
      <div className="absolute bottom-8 text-white/50 text-xs">
        v{tenant?.settings?.version || '1.0.0'}
      </div>
    </div>
  );
}