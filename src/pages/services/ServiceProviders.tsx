import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Bookmark, Check, ChevronRight, SearchX, Send, Star } from 'lucide-react';
import { EmptyState } from '@/components/layout/EmptyState';
import { Panel, PrimaryAction, ProviderPage, SaveError, StatusBadge, type Tone } from '@/components/provider/ProviderUi';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useServiceCatalogue } from '@/hooks/useServiceCatalogue';
import { farmServicesService, type NearbyProvider, type NearbyService } from '@/services/farmServicesService';
import { nurseryPhotoUrl } from '@/services/nurseryPhotoService';
import { localName, providerWorkspaceService, type LocalNames } from '@/services/providerWorkspaceService';
import { useFarmServicesStore } from '@/stores/farmServicesStore';
import { FARM_SERVICES_ROUTES } from '@/lib/farmServicesRoutes';
import { distanceText, farmServicesErrorMessage } from '@/lib/farmServicesText';
import { hapticFeedback } from '@/lib/haptics';
import { familyIcon } from '@/lib/providerIcons';
import { catalogueLabel, formatDay, serviceRateText } from '@/lib/providerText';
import { cn } from '@/lib/utils';

const NURSERY_FAMILY = 'NURSERY';

const STATE_TONE: Record<NearbyProvider['availability']['state'], Tone> = {
  AVAILABLE: 'good', BUSY: 'busy', NOT_ACCEPTING: 'off', OFFLINE: 'off',
};

/** What the farmer sees of a provider's state: free, busy until a day, or not taking work. */
export function availabilityText(t: (key: string, options?: Record<string, unknown>) => string, a: NearbyProvider['availability']): string {
  if (a.state === 'BUSY' && a.next_free_date) return t('farmServices.busyUntil', { date: formatDay(a.next_free_date) });
  return t(`farmServices.state.${a.state}`);
}

type SortKey = 'near' | 'rate' | 'rated' | 'free' | 'saved';

/** Whether the provider takes a request from the app right now. */
function takesRequests(p: NearbyProvider): boolean {
  return p.accepts_requests && p.availability.state !== 'NOT_ACCEPTING' && p.availability.state !== 'OFFLINE';
}

/** The lowest rate a provider asks among the services shown; null when none has a rate. */
function lowestRate(services: NearbyService[]): number | null {
  const rates = services.map((s) => s.base_rate).filter((r): r is number => r != null).map(Number);
  return rates.length > 0 ? Math.min(...rates) : null;
}

/** A row of pills that scrolls sideways; exactly one is on. */
function PillRow({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((option) => {
        const isOn = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isOn}
            onClick={() => { hapticFeedback('light'); onChange(option.value); }}
            className={cn(
              'min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-4 text-base transition-colors',
              isOn ? 'bg-primary text-primary-foreground font-bold' : 'bg-card text-foreground font-medium shadow-sm',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The providers of one kind of work near the farmer. He can narrow to one
 * work, put the nearest, the cheapest, the best rated, the free or his saved
 * ones first, keep a provider for later, and ask: one provider for one of his
 * services, or every provider near the land at once. A nursery opens as a
 * store instead.
 */
export default function ServiceProviders() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { family = '' } = useParams<{ family: string }>();
  const isOnline = useOfflineStatus();
  const { catalogue, error: catalogueError } = useServiceCatalogue();
  const setDraft = useFarmServicesStore((s) => s.setDraft);
  const [providers, setProviders] = useState<NearbyProvider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cropNames, setCropNames] = useState<Record<string, LocalNames>>({});
  const [work, setWork] = useState('');
  const [sort, setSort] = useState<SortKey>('near');

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
  const units = catalogue?.pricingUnits;
  const categoryLabel = useCallback(
    (code: string) => catalogueLabel('category', code, catalogue?.categories.find((c) => c.code === code)?.label_en),
    [catalogue],
  );

  // The works offered near the farmer, each with the unit most providers charge it in
  // (a request to everyone needs a unit an amount can be given in).
  const works = useMemo(() => {
    const byCode = new Map<string, Map<string, number>>();
    for (const p of providers ?? []) {
      for (const s of p.services) {
        const counts = byCode.get(s.category_code) ?? new Map<string, number>();
        const fixed = !units?.find((u) => u.code === s.pricing_unit)?.is_negotiable;
        if (fixed) counts.set(s.pricing_unit, (counts.get(s.pricing_unit) ?? 0) + 1);
        byCode.set(s.category_code, counts);
      }
    }
    return Array.from(byCode, ([code, counts]) => ({
      code,
      unit: Array.from(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    }));
  }, [providers, units]);

  const shownServices = useCallback(
    (p: NearbyProvider) => (work ? p.services.filter((s) => s.category_code === work) : p.services),
    [work],
  );

  // "Lowest rate" is offered only when the rates can be compared: one work, charged in one unit.
  const rateComparable = useMemo(() => {
    if (!work) return false;
    const priced = (providers ?? []).flatMap((p) => p.services).filter((s) => s.category_code === work && s.base_rate != null);
    return priced.length > 1 && new Set(priced.map((s) => s.pricing_unit)).size === 1;
  }, [providers, work]);
  const activeSort: SortKey = sort === 'rate' && !rateComparable ? 'near' : sort;

  const shown = useMemo(() => {
    let list = (providers ?? []).filter((p) => isNursery || !work || p.services.some((s) => s.category_code === work));
    if (activeSort === 'free') list = list.filter((p) => p.availability.state === 'AVAILABLE');
    if (activeSort === 'saved') list = list.filter((p) => p.saved);
    const byDistance = (a: NearbyProvider, b: NearbyProvider) => a.distance_km - b.distance_km;
    return [...list].sort((a, b) => {
      if (activeSort === 'rate') {
        const ra = lowestRate(shownServices(a));
        const rb = lowestRate(shownServices(b));
        if (ra != null && rb != null && ra !== rb) return ra - rb;
        if ((ra == null) !== (rb == null)) return ra == null ? 1 : -1;
      }
      if (activeSort === 'rated') {
        const sa = a.rating_count > 0 ? Number(a.rating_average ?? 0) : -1;
        const sb = b.rating_count > 0 ? Number(b.rating_average ?? 0) : -1;
        if (sa !== sb) return sb - sa;
      }
      return byDistance(a, b);
    });
  }, [providers, isNursery, work, activeSort, shownServices]);

  const toggleSaved = async (p: NearbyProvider) => {
    const next = !p.saved;
    const apply = (value: boolean) =>
      setProviders((current) => current?.map((x) => (x.account_id === p.account_id ? { ...x, saved: value } : x)) ?? current);
    hapticFeedback('light');
    setSaveError(null);
    apply(next);
    try {
      apply(await farmServicesService.saveProvider(p.account_id, next));
    } catch (e) {
      apply(!next);
      setSaveError(farmServicesErrorMessage(e));
    }
  };

  const askProvider = (p: NearbyProvider, s: NearbyService) => {
    setDraft({
      kind: 'SERVICE', familyCode: family,
      provider: { accountId: p.account_id, name: p.public_name },
      service: { id: s.id, title: s.title, categoryCode: s.category_code, rate: s.base_rate, unit: s.pricing_unit, currency: s.currency },
    });
    navigate(FARM_SERVICES_ROUTES.ask);
  };

  // Asking everyone: the chosen work, or a choice among the works that have a unit.
  const askable = works.filter((w) => w.unit && (!work || w.code === work)) as { code: string; unit: string }[];
  const askEveryone = () => {
    setDraft({ kind: 'SERVICE', familyCode: family, categories: askable });
    navigate(FARM_SERVICES_ROUTES.ask);
  };
  const canAskEveryone = !isNursery && askable.length > 0 && (providers ?? []).filter(takesRequests).length > 1;

  const sortOptions = [
    { value: 'near', label: t('farmServices.sort.near') },
    ...(rateComparable ? [{ value: 'rate', label: t('farmServices.sort.rate') }] : []),
    { value: 'rated', label: t('farmServices.sort.rated') },
    { value: 'free', label: t('farmServices.sort.free') },
    { value: 'saved', label: t('farmServices.sort.saved') },
  ];

  return (
    <ProviderPage
      title={familyRow ? catalogueLabel('category', family, familyRow.label_en) : t('farmServices.title')}
      eyebrow={providers ? t('farmServices.providersCount', { count: providers.length }) : undefined}
      backTo={FARM_SERVICES_ROUTES.home}
      pending={!catalogue || (!providers && !error && isOnline)}
      loadError={error ?? catalogueError}
      onRetry={load}
      isOnline={isOnline}
      footer={canAskEveryone ? (
        <PrimaryAction onClick={askEveryone} icon={Send} disabled={!isOnline}>
          {t('farmServices.askAll')}
        </PrimaryAction>
      ) : undefined}
    >
      {catalogue && providers && (
        <div className="space-y-3">
          {providers.length === 0 && (
            <EmptyState icon={SearchX} title={t('farmServices.noneTitle')} description={t('farmServices.noneDescription')} />
          )}

          {providers.length > 0 && (
            <div className="space-y-2">
              {!isNursery && works.length > 1 && (
                <PillRow
                  label={t('farmServices.whichWork')}
                  value={work}
                  onChange={setWork}
                  options={[{ value: '', label: t('farmServices.allWork') }, ...works.map((w) => ({ value: w.code, label: categoryLabel(w.code) }))]}
                />
              )}
              {providers.length > 1 && (
                <PillRow label={t('farmServices.sort.label')} value={activeSort} onChange={(v) => setSort(v as SortKey)} options={sortOptions} />
              )}
            </div>
          )}
          <SaveError message={saveError} />

          {providers.length > 0 && shown.length === 0 && (
            <p className="py-6 text-center text-base text-muted-foreground">
              {t(activeSort === 'saved' ? 'farmServices.noneSaved' : 'farmServices.noneFree')}
            </p>
          )}

          {shown.map((p) => {
            const crops = (p.store?.crop_ids ?? []).map((id) => localName(cropNames[id], i18n.language)).filter(Boolean);
            const canAsk = takesRequests(p);
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
                          {Number(p.rating_average).toFixed(1)} ({p.rating_count})
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={!!p.saved}
                    aria-label={t(p.saved ? 'farmServices.unsave' : 'farmServices.save')}
                    disabled={!isOnline}
                    onClick={() => toggleSaved(p)}
                    className={cn(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-full active:scale-95 disabled:opacity-60',
                      p.saved ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Bookmark className={cn('h-6 w-6', p.saved && 'fill-current')} aria-hidden="true" />
                  </button>
                </div>
                <StatusBadge tone={STATE_TONE[p.availability.state]}>{availabilityText(t, p.availability)}</StatusBadge>

                {!isNursery && shownServices(p).map((s) => {
                  const includes = [
                    s.includes_operator ? t('provider.services.includesOperator') : null,
                    s.includes_fuel ? t('provider.services.includesFuel') : null,
                    s.includes_material ? t('provider.services.includesMaterial') : null,
                  ].filter(Boolean);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!canAsk}
                      onClick={() => askProvider(p, s)}
                      className="block w-full rounded-2xl bg-muted px-4 py-3 text-left active:scale-[0.99] disabled:active:scale-100"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-base font-semibold text-foreground break-words">{s.title}</span>
                        <span className="shrink-0 text-base font-bold text-primary">{serviceRateText(s, catalogue.pricingUnits)}</span>
                      </span>
                      {includes.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                          {includes.map((text) => (
                            <span key={text} className="inline-flex items-center gap-1">
                              <Check className="h-4 w-4 text-primary" aria-hidden="true" />{text}
                            </span>
                          ))}
                        </span>
                      )}
                      {canAsk && (
                        <span className="mt-3 flex h-12 items-center justify-center gap-1 rounded-xl bg-primary text-base font-bold text-primary-foreground">
                          {t('farmServices.askThis')}
                          <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                    </button>
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
