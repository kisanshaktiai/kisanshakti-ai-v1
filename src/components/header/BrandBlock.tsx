import { Leaf } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';

/**
 * Compact brand block for the app header.
 * Logo (with soft glow) + brand name (truncated) + greeting pill (when space allows).
 * Falls back to Leaf icon if logo fails to load.
 */
export function BrandBlock() {
  const { tenant, branding } = useTenant();
  const { user } = useAuthStore();
  const { t } = useTranslation();

  const logoUrl = branding?.logo_url;
  const companyName = branding?.company_name || tenant?.name || t('app.name');
  const tagline = (branding?.tagline && branding.tagline.trim()) || t('app.tagline');
  const firstName = user?.fullName?.split(' ')[0];

  return (
    <div className="flex items-center gap-2.5 min-w-0 flex-1">
      <div className="relative shrink-0">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={companyName}
            className="h-8 w-8 object-contain rounded-lg"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <Leaf
          className={`h-8 w-8 text-primary ${logoUrl ? 'hidden' : ''}`}
          style={{ filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.35))' }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-[15px] font-bold text-primary leading-tight truncate">
          {companyName}
        </h1>
        <p className="text-[10px] text-muted-foreground leading-tight truncate">
          {firstName ? `Hi, ${firstName} 👋` : tagline}
        </p>
      </div>
    </div>
  );
}
