import { motion } from 'framer-motion';
import { Leaf, Sparkles, Globe } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';

export function AppHeader() {
  const { tenant } = useTenant();

  return (
    <header className="sticky top-0 z-50 glassmorphism-strong border-b border-border/30 shadow-lg">
      <div className="flex flex-col items-center py-6 px-4 space-y-4">
        <motion.div 
          className="flex items-center justify-center"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {tenant?.branding?.logo_url ? (
            <img 
              src={tenant.branding.logo_url} 
              alt={tenant?.branding?.company_name || tenant?.name || 'App Logo'}
              className="h-16 w-auto object-contain drop-shadow-2xl"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`flex items-center space-x-3 ${tenant?.branding?.logo_url ? 'hidden' : ''}`}>
            <div className="relative">
              <Leaf className="h-16 w-16 text-primary drop-shadow-2xl" />
              <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-primary animate-pulse" />
            </div>
            <span className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              {tenant?.branding?.company_name || tenant?.name || 'KisanShakti'}
            </span>
          </div>
        </motion.div>
        
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
            <Globe className="w-6 h-6 text-primary" aria-hidden="true" />
            Select Your Language
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            अपनी भाषा चुनें | Choose your language
          </p>
        </div>
      </div>
    </header>
  );
}
