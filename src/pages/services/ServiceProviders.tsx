import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, SearchX, Star } from 'lucide-react';
import { EmptyState } from '@/components/layout/EmptyState';
import { Panel, ProviderPage, StatusBadge, type Tone } from '@/components/provider/ProviderUi';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useServiceCatalogue } from '@/hooks/useServiceCatalogue';
import { farmServicesService, type NearbyProvider } from '@/services/farmServicesService';
import { nurseryPhotoUrl } from '@/services/nurseryPhotoService';
import { localName, providerWorkspaceService, type LocalNames } from '@/services/providerWorkspaceService';
import { FARM_SERVICES_ROUTES } from '@/lib/farmServicesRoutes';
import { distanceText, farmServicesErrorMessage } from '@/lib/farmServicesText';
import { familyIcon } from '@/lib/providerIcons';
import { catalogueLabel, formatDay, serviceRateText } from '@/lib/providerText';

const NURSERY_FAMILY = 'NURSERY';

const STATE_TONE: Record<NearbyProvider['availability']['state'], Tone> = {
  AVAILABLE: 'good', BUSY: 'busy', NOT_ACCEPTING: 'off', OFFLINE: 'off',
};

/** What the farmer sees of a provider's state: free, busy until a day, or not taking work. */
export function availabilityText(t: (key: string, options?: Record<string, unknown>) => string, a: NearbyProvider['availability']): string {
  if (a.state === 'BUSY' && a.next_free_date) return t('farmServices.busyUntil', { date: formatDay(a.next_free_date) });
  return t(`farmServices.state.${a.state}`);
}

/**
 * The providers of one kind of work near the farmer, free ones first. For
 * tractor work and the like the card lists the services with their rates;
 * for nurseries it shows the plants' photos and opens the store.
 */
export default function ServiceProviders() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { family = '' } = useParams<{ family: string }>();
  const isOnline = useOfflineStatus();
  const { catalogue, error: catalogueError } = useServiceCatalogue();
  const [providers, setProviders] = useState<NearbyProvider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cropNames, setCropNames] = useState<Record<string, LocalNames>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      setProviders(await farmServicesService.providers(family));
    } catch (e) {
      setError(farmServicesErrorMessage(e));
    }
  }, [family]);

  useEffect(() => { if (isOnline && family) void load(); }, [isOnline, family, load]);

  // Names of the crops the nurseries sell, for the store summary line.
  const cropIdsKey = Array.from(new Set((providers ?? []).flatMap((p) => p.store?.crop_ids ?? []))).sort().join(',');
  useEffect(() => {
    if (!cropIdsKey) return;
    let cancelled = false;
    providerWorkspaceService.cropNames(cropIdsKey.split(','))
      .then((names) => { if (!cancelled) setCropNames((current) => ({ ...current, ...names })); })
      .catch(() => { /* the line shows the count alone */ });
    return () => { cancelled = true; };
  }, [cropIdsKey]);

  const familyRow = catalogue?.categories.find((c) => c.code === family && c.parent_code === null);
  const FamilyIcon = familyIcon(family);
  const isNursery = family === NURSERY_FAMILY;

  return (
    <ProviderPage
      title={familyRow ? catalogueLabel('category', family, familyRow.label_en) : t('farmServices.title')}
      eyebrow={providers ? t('farmServices.providersCount', { count: providers.length }) : undefined}
      backTo={FARM_SERVICES_ROUTES.home}
      pending={!catalogue || (!providers && !error && isOnline)}
      loadError={error ?? catalogueError}
      onRetry={load}
      isOnline={isOnline}
    >
      {catalogue && providers && (
        <div className="space-y-3">
          {providers.length === 0 && (
            <EmptyState icon={SearchX} title={t('farmServices.noneTitle')} description={t('farmServices.noneDescription')} />
          )}
          {providers.map((p) => {
            const crops = (p.store?.crop_ids ?? []).map((id) => localName(cropNames[id], i18n.language)).filter(Boolean);
            return (
              <Panel key={p.account_id} className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FamilyIcon className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold leading-tight text-foreground break-words">{p.public_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {distanceText(p.distance_km)}
                      {p.rating_count > 0 && p.rating_average != null && (
                        <span className="ml-2 inline-flex items-center gap-1">
                          <Star className="h-4 w-4 fill-current text-warning" aria-hidden="true" />
                          {p.rating_average.toFixed(1)} ({p.rating_count})
                        </span>
                      )}
                    </p>
                  </div>
                  <StatusBadge tone={STATE_TONE[p.availability.state]}>{availabilityText(t, p.availability)}</StatusBadge>
                </div>

                {!isNursery && p.services.map((s) => {
                  const includes = [
                    s.includes_operator ? t('provider.services.includesOperator') : null,
                    s.includes_fuel ? t('provider.services.includesFuel') : null,
                    s.includes_material ? t('provider.services.includesMaterial') : null,
                  ].filter(Boolean);
                  return (
                    <div key={s.id} className="rounded-2xl bg-muted px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-base font-semibold text-foreground break-words">{s.title}</span>
                        <span className="shrink-0 text-base font-bold text-primary">{serviceRateText(s, catalogue.pricingUnits)}</span>
                      </div>
                      {includes.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                          {includes.map((text) => (
                            <span key={text} className="inline-flex items-center gap-1">
                              <Check className="h-4 w-4 text-primary" aria-hidden="true" />{text}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  );
                })}

                {isNursery && p.store && (
                  <>
                    {p.store.photo_paths.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {p.store.photo_paths.map((path) => (
                          <img key={path} src={nurseryPhotoUrl(path)} alt="" loading="lazy" className="h-24 w-full rounded-2xl object-cover bg-muted" />
                        ))}
                      </div>
                    )}
                    <p className="text-base text-foreground">
                      {t('farmServices.storePlants', { count: p.store.product_count })}
                      {crops.length > 0 ? ` · ${crops.join(', ')}` : ''}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(FARM_SERVICES_ROUTES.store(p.account_id))}
                      className="flex w-full h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-md active:scale-[0.99]"
                    >
                      {t('farmServices.openStore')}
                      <ArrowRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </ProviderPage>
  );
}
