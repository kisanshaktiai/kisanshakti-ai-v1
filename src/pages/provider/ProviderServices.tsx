import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pause, Pencil, Play, Plus, Trash2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/layout/EmptyState';
import { Panel, PrimaryAction, ProviderPage, SaveError, StatusBadge } from '@/components/provider/ProviderUi';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { providerWorkspaceService } from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { familyIcon } from '@/lib/providerIcons';
import { catalogueLabel, serviceRateText } from '@/lib/providerText';
import { cn } from '@/lib/utils';

/**
 * The services the provider offers, each as a card with the picture of its
 * kind of work and the rate in large type. A service can be paused (kept, but
 * not offered), resumed, edited or removed.
 */
export default function ProviderServices() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspace, catalogue, loading, loadError, isOnline, saving, saveError, run, reload } = useProviderWorkspace();

  const services = workspace?.services ?? [];
  const limitReached = !!workspace && services.length >= workspace.policy.max_services;
  const busy = saving || !isOnline;

  return (
    <ProviderPage
      title={t('provider.services.title')}
      backTo={PROVIDER_ROUTES.business}
      pending={(loading && !workspace) || !catalogue}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
      footer={workspace && catalogue ? (
        <PrimaryAction onClick={() => navigate(PROVIDER_ROUTES.serviceNew)} disabled={limitReached || !isOnline} icon={Plus}>
          {t('provider.services.add')}
        </PrimaryAction>
      ) : undefined}
    >
      {workspace && catalogue && (
        <div className="space-y-3">
          <SaveError message={saveError} />
          {limitReached && (
            <p className="text-sm text-muted-foreground">
              {t('provider.services.limit', { count: workspace.policy.max_services })}
            </p>
          )}

          {services.length === 0 && (
            <EmptyState
              icon={Wrench}
              title={t('provider.services.emptyTitle')}
              description={t('provider.services.emptyDescription')}
            />
          )}

          {services.map((service) => {
            const category = catalogue.categories.find((c) => c.code === service.category_code);
            const Icon = familyIcon(category?.parent_code);
            const paused = service.status === 'PAUSED';
            return (
              <Panel key={service.id} className={cn('space-y-3', paused && 'opacity-80')}>
                <div className="flex items-start gap-3">
                  <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', paused ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>
                    <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold leading-tight text-foreground break-words">{service.title}</p>
                    <p className="text-sm text-muted-foreground break-words">
                      {catalogueLabel('category', service.category_code, category?.label_en)}
                    </p>
                  </div>
                  <StatusBadge tone={paused ? 'off' : 'good'}>{t(`provider.common.status.${service.status}`)}</StatusBadge>
                </div>
                <p className="text-2xl font-bold text-primary">{serviceRateText(service, catalogue.pricingUnits)}</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    className="h-12 rounded-2xl"
                    onClick={() => navigate(PROVIDER_ROUTES.serviceEdit(service.id))}
                    disabled={!isOnline}
                    aria-label={t('provider.common.edit')}
                  >
                    <Pencil className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    <span className="truncate">{t('provider.common.edit')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 rounded-2xl"
                    disabled={busy}
                    onClick={() => run(() => providerWorkspaceService.setServiceStatus(service.id, paused ? 'ACTIVE' : 'PAUSED'))}
                  >
                    {paused ? <Play className="w-4 h-4 mr-1.5" aria-hidden="true" /> : <Pause className="w-4 h-4 mr-1.5" aria-hidden="true" />}
                    <span className="truncate">{t(paused ? 'provider.services.resume' : 'provider.services.pause')}</span>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="h-12 rounded-2xl" disabled={busy}>
                        <Trash2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
                        <span className="truncate">{t('provider.common.remove')}</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('provider.services.removeTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('provider.services.removeDescription', { title: service.title })}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="h-12">{t('provider.common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          className="h-12"
                          onClick={() => run(() => providerWorkspaceService.setServiceStatus(service.id, 'REMOVED'))}
                        >
                          {t('provider.common.remove')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </ProviderPage>
  );
}
