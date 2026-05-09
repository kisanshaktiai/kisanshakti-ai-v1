import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/TenantContext';

/**
 * Full-screen blocker shown when the tenant's own platform subscription is
 * past its grace period. Farmers cannot use the app until their organisation
 * renews — they are directed to contact their admin.
 */
export function TenantSuspendedScreen() {
  const { t } = useTranslation('common');
  const { branding } = useTenant();

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="h-8 w-8 text-destructive" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">
        {t('tenant_suspended.title', { defaultValue: 'Service paused' })}
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t('tenant_suspended.body', {
          defaultValue:
            "Your organisation's plan needs renewal. Please contact your administrator to restore access.",
        })}
      </p>
      {branding?.company_name && (
        <p className="text-xs text-muted-foreground">
          {t('tenant_suspended.org', { defaultValue: 'Organisation' })}: <b>{branding.company_name}</b>
        </p>
      )}
      <Button variant="outline" onClick={() => window.location.reload()}>
        {t('actions.retry', { defaultValue: 'Retry' })}
      </Button>
    </div>
  );
}
