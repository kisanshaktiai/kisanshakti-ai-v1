import { motion } from 'framer-motion';
import { Leaf, Sparkles, Globe } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';

export function AppHeader() {
  const { tenant } = useTenant();

  return (
    <header className="sticky top-0 z-50 glassmorphism-strong border-b border-border/30 shadow-lg">
      <div className="flex flex-col items-center py-3 px-4 space-y-2">
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
              className="h-10 w-auto object-contain drop-shadow-lg"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`flex items-center space-x-2 ${tenant?.branding?.logo_url ? 'hidden' : ''}`}>
            <div className="relative">
              <Leaf className="h-10 w-10 text-primary drop-shadow-lg" />
              <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-primary animate-pulse" />
            </div>
            <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              {tenant?.branding?.company_name || tenant?.name || 'KisanShakti'}
            </span>
          </div>
        </motion.div>
        
        <div className="text-center space-y-1">
          <h1 className="text-lg font-bold text-foreground flex items-center justify-center gap-2">
            <Globe className="w-5 h-5 text-primary" aria-hidden="true" />
            Select Your Language
          </h1>
          <p className="text-xs text-muted-foreground font-medium">
            अपनी भाषा चुनें | Choose your language
          </p>
        </div>
      </div>
    </header>
  );
}
