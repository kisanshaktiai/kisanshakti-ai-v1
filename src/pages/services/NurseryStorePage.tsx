import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, SearchX, Star, TreePine } from 'lucide-react';
import { EmptyState } from '@/components/layout/EmptyState';
import { Panel, ProviderPage, StatusBadge, type Tone } from '@/components/provider/ProviderUi';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useServiceCatalogue } from '@/hooks/useServiceCatalogue';
import { farmServicesService, type NurseryStore, type StoreProduct } from '@/services/farmServicesService';
import { nurseryPhotoUrl } from '@/services/nurseryPhotoService';
import { localName, providerWorkspaceService, type LocalNames } from '@/services/providerWorkspaceService';
import { FARM_SERVICES_ROUTES } from '@/lib/farmServicesRoutes';
import { distanceText, farmServicesErrorMessage } from '@/lib/farmServicesText';
import { catalogueLabel, formatDay, formatMoney } from '@/lib/providerText';
import { availabilityText } from '@/pages/services/ServiceProviders';

const STATE_TONE: Record<NurseryStore['provider']['availability']['state'], Tone> = {
  AVAILABLE: 'good', BUSY: 'busy', NOT_ACCEPTING: 'off', OFFLINE: 'off',
};

/** The variety as the farmer should read it: the master's name in his language, else the nursery's own name. */
function varietyText(p: StoreProduct, language: string): string {
  if (p.variety_names) {
    const names: LocalNames = {};
    for (const [key, value] of Object.entries(p.variety_names)) if (value) names[key === 'en' ? 'default' : key] = value;
    return localName(names, language);
  }
  return p.variety_name_local ?? '';
}

/**
 * One nursery as a store: every plant on sale with photos, variety, kind,
 * price and the stock free now or by ready date. Booking comes with the
 * request engine of the next task; until then the farmer sees and compares.
 */
export default function NurseryStorePage() {
  const { t, i18n } = useTranslation();
  const { accountId = '' } = useParams<{ accountId: string }>();
  const isOnline = useOfflineStatus();
  const { catalogue, error: catalogueError } = useServiceCatalogue();
  const [store, setStore] = useState<NurseryStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cropNames, setCropNames] = useState<Record<string, LocalNames>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      setStore(await farmServicesService.store(accountId));
    } catch (e) {
      setError(farmServicesErrorMessage(e));
    }
  }, [accountId]);

  useEffect(() => { if (isOnline && accountId) void load(); }, [isOnline, accountId, load]);

  const cropIdsKey = Array.from(new Set((store?.products ?? []).map((p) => p.crop_id))).sort().join(',');
  useEffect(() => {
    if (!cropIdsKey) return;
    let cancelled = false;
    providerWorkspaceService.cropNames(cropIdsKey.split(','))
      .then((names) => { if (!cancelled) setCropNames((current) => ({ ...current, ...names })); })
      .catch(() => { /* the crop shows by its id's fallback text */ });
    return () => { cancelled = true; };
  }, [cropIdsKey]);

  const kindLabel = (code: string) => catalogueLabel('nurseryKind', code, catalogue?.nurseryItemKinds.find((k) => k.code === code)?.label_en);
  const unitLabel = (code: string) => catalogueLabel('unit', code, catalogue?.pricingUnits.find((u) => u.code === code)?.label_en);
  const provider = store?.provider;

  return (
    <ProviderPage
      title={provider?.public_name ?? t('farmServices.storeTitle')}
      eyebrow={provider ? `${distanceText(provider.distance_km)} · ${availabilityText(t, provider.availability)}` : undefined}
      backTo={FARM_SERVICES_ROUTES.family('NURSERY')}
      pending={!catalogue || (!store && !error && isOnline)}
      loadError={error ?? catalogueError}
      onRetry={load}
      isOnline={isOnline}
    >
      {catalogue && store && provider && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={STATE_TONE[provider.availability.state]}>{availabilityText(t, provider.availability)}</StatusBadge>
            {provider.rating_count > 0 && provider.rating_average != null && (
              <StatusBadge tone="neutral">
                <Star className="h-4 w-4 fill-current text-warning" aria-hidden="true" />
                {provider.rating_average.toFixed(1)} ({provider.rating_count})
              </StatusBadge>
            )}
            {provider.verification_level && (
              <StatusBadge tone="neutral">{t(`farmServices.verification.${provider.verification_level}`, { defaultValue: provider.verification_level })}</StatusBadge>
            )}
          </div>
          {provider.about_text && <p className="text-base text-muted-foreground">{provider.about_text}</p>}

          <h2 className="text-lg font-bold text-foreground pt-1">{t('farmServices.storePlantsTitle')}</h2>
          {store.products.length === 0 && (
            <EmptyState icon={SearchX} title={t('farmServices.storeEmptyTitle')} description={t('farmServices.storeEmptyDescription')} />
          )}
          {store.products.map((p) => {
            const crop = localName(cropNames[p.crop_id], i18n.language) || t('provider.nursery.cropUnknown');
            const variety = varietyText(p, i18n.language);
            const nextBatch = p.available_qty === 0 ? p.batches[0] : undefined;
            return (
              <Panel key={p.id} className="space-y-3">
                <div className="flex gap-3">
                  {p.photo_paths[0] ? (
                    <img src={nurseryPhotoUrl(p.photo_paths[0])} alt={crop} loading="lazy" className="h-28 w-28 shrink-0 rounded-2xl object-cover bg-muted" />
                  ) : (
                    <span className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <TreePine className="h-10 w-10" strokeWidth={1.5} aria-hidden="true" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xl font-bold leading-tight text-foreground break-words">{crop}</p>
                    <p className="text-sm text-muted-foreground break-words">{[variety, kindLabel(p.item_kind)].filter(Boolean).join(' · ')}</p>
                    <p className="text-2xl font-bold text-primary">
                      {p.price != null ? formatMoney(Number(p.price), p.currency) : unitLabel(p.pricing_unit)}
                      {p.price != null && <span className="ml-1 text-sm font-semibold text-muted-foreground">{unitLabel(p.pricing_unit)}</span>}
                    </p>
                    {p.available_qty > 0 ? (
                      <StatusBadge tone="good">{t('farmServices.readyNow', { count: p.available_qty })}</StatusBadge>
                    ) : nextBatch ? (
                      <StatusBadge tone="busy">
                        <Clock className="h-4 w-4" aria-hidden="true" />
                        {t('farmServices.readyOn', { date: formatDay(nextBatch.ready_date), count: nextBatch.available_qty })}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="off">{t('farmServices.outOfStock')}</StatusBadge>
                    )}
                  </div>
                </div>
                {p.photo_paths.length > 1 && (
                  <div className="grid grid-cols-3 gap-2">
                    {p.photo_paths.slice(1).map((path) => (
                      <img key={path} src={nurseryPhotoUrl(path)} alt="" loading="lazy" className="h-24 w-full rounded-2xl object-cover bg-muted" />
                    ))}
                  </div>
                )}
                {p.description && <p className="text-base text-foreground">{p.description}</p>}
                {p.min_order_qty != null && (
                  <p className="text-sm text-muted-foreground">{t('farmServices.minOrder', { count: p.min_order_qty })}</p>
                )}
              </Panel>
            );
          })}
          <p className="text-sm text-muted-foreground">{t('farmServices.bookingSoon')}</p>
        </div>
      )}
    </ProviderPage>
  );
}
