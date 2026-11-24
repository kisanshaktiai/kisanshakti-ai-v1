import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pause, Pencil, Play, Plus, Trash2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/layout/EmptyState';
import { ProviderPage, SaveError } from '@/components/provider/ProviderUi';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { providerWorkspaceService } from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { catalogueLabel, serviceRateText } from '@/lib/providerText';

/**
 * The services the provider offers, each with its rate. A service can be
 * paused (kept, but not offered), resumed, edited or removed.
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
    >
      {workspace && catalogue && (
        <>
          <SaveError message={saveError} />

          <Button
            className="w-full h-12 text-base"
            onClick={() => navigate(PROVIDER_ROUTES.serviceNew)}
            disabled={limitReached || !isOnline}
          >
            <Plus className="w-5 h-5 mr-2" aria-hidden="true" />
            {t('provider.services.add')}
          </Button>
          {limitReached && (
            <p className="text-xs text-muted-foreground">
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
            const paused = service.status === 'PAUSED';
            return (
              <Card key={service.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground break-words">{service.title}</p>
                    <p className="text-sm text-muted-foreground break-words">
                      {catalogueLabel('category', service.category_code, category?.label_en)}
                    </p>
                  </div>
                  <Badge variant={paused ? 'secondary' : 'default'} className="shrink-0">
                    {t(`provider.common.status.${service.status}`)}
                  </Badge>
                </div>
                <p className="text-lg font-semibold text-foreground">{serviceRateText(service, catalogue.pricingUnits)}</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    className="h-12"
                    onClick={() => navigate(PROVIDER_ROUTES.serviceEdit(service.id))}
                    disabled={!isOnline}
                    aria-label={t('provider.common.edit')}
                  >
                    <Pencil className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    <span className="truncate">{t('provider.common.edit')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12"
                    disabled={busy}
                    onClick={() => run(() => providerWorkspaceService.setServiceStatus(service.id, paused ? 'ACTIVE' : 'PAUSED'))}
                  >
                    {paused ? <Play className="w-4 h-4 mr-1.5" aria-hidden="true" /> : <Pause className="w-4 h-4 mr-1.5" aria-hidden="true" />}
                    <span className="truncate">{t(paused ? 'provider.services.resume' : 'provider.services.pause')}</span>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="h-12" disabled={busy}>
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
              </Card>
            );
          })}
        </>
      )}
    </ProviderPage>
  );
}
