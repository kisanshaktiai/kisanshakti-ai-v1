import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays, Check, CheckCheck, CircleCheck, ClipboardList, Handshake, MapPin, MessageCircle, Phone, Send, Star, TreePine,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/layout/EmptyState';
import { Panel, ProviderPage, SaveError, StatusBadge, type Tone } from '@/components/provider/ProviderUi';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useServiceCatalogue } from '@/hooks/useServiceCatalogue';
import { farmServicesService, type FarmRequest, type FarmRequestStatus, type RequestOffer } from '@/services/farmServicesService';
import { nurseryPhotoUrl } from '@/services/nurseryPhotoService';
import { localName, providerWorkspaceService, type LocalNames } from '@/services/providerWorkspaceService';
import { FARM_SERVICES_ROUTES } from '@/lib/farmServicesRoutes';
import {
  amountText, distanceText, estimateText, farmServicesErrorMessage, phoneLink, plantVarietyText, rateText,
} from '@/lib/farmServicesText';
import { familyIcon } from '@/lib/providerIcons';
import { catalogueLabel, formatDay } from '@/lib/providerText';
import { cn } from '@/lib/utils';

/** How often the list is read again while the screen is open (an answer may have come). */
const REFRESH_MS = 60_000;

const STEPS: { key: string; icon: LucideIcon }[] = [
  { key: 'sent', icon: Send },
  { key: 'answer', icon: MessageCircle },
  { key: 'booked', icon: Handshake },
  { key: 'done', icon: CheckCheck },
];

/** How many of the four steps a request has passed. */
function stepsReached(r: FarmRequest): number {
  if (r.status === 'DONE') return 4;
  if (r.status === 'CONFIRMED') return 3;
  if (r.status === 'OPEN' && r.offers.length > 0) return 2;
  return 1;
}

const ENDED_TONE: Partial<Record<FarmRequestStatus, Tone>> = { CANCELLED: 'off', DECLINED: 'off', EXPIRED: 'off' };

/** The four steps as a row of pictures: reached ones filled, the rest pale. */
function StepRow({ reached }: { reached: number }) {
  const { t } = useTranslation();
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label={t('farmServices.requests.stepsLabel', { current: reached, total: STEPS.length })}>
      {STEPS.map(({ key, icon: Icon }, i) => {
        const on = i < reached;
        return (
          <li key={key} className="flex flex-col items-center gap-1">
            <div className="flex w-full items-center">
              <span className={cn('h-1 flex-1 rounded-full', i === 0 ? 'opacity-0' : on ? 'bg-primary' : 'bg-muted')} aria-hidden="true" />
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className={cn('h-1 flex-1 rounded-full', i === STEPS.length - 1 ? 'opacity-0' : i + 1 < reached ? 'bg-primary' : 'bg-muted')} aria-hidden="true" />
            </div>
            <span className={cn('text-xs leading-tight text-center', on ? 'font-bold text-foreground' : 'text-muted-foreground')}>
              {t(`farmServices.requests.step.${key}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * "My requests": everything the farmer asked for, the newest first, each with
 * where it stands in four steps. An answer that changes the rate or the day
 * waits here for his yes; a booked request shows the provider's number to
 * call; a finished one asks for stars.
 */
export default function MyServiceRequests() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useOfflineStatus();
  const { catalogue } = useServiceCatalogue();
  const [requests, setRequests] = useState<FarmRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [stars, setStars] = useState<Record<string, number>>({});
  const [cropNames, setCropNames] = useState<Record<string, LocalNames>>({});
  const justSent = !!(location.state as { sent?: boolean } | null)?.sent;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setRequests(await farmServicesService.myRequests());
    } catch (e) {
      setLoadError(farmServicesErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void load();
    const again = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(again, REFRESH_MS);
    document.addEventListener('visibilitychange', again);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', again); };
  }, [isOnline, load]);

  const cropIdsKey = Array.from(new Set((requests ?? []).map((r) => r.plant?.crop_id).filter(Boolean) as string[])).sort().join(',');
  useEffect(() => {
    if (!cropIdsKey) return;
    let cancelled = false;
    providerWorkspaceService.cropNames(cropIdsKey.split(','))
      .then((names) => { if (!cancelled) setCropNames((current) => ({ ...current, ...names })); })
      .catch(() => { /* the plant shows by its variety alone */ });
    return () => { cancelled = true; };
  }, [cropIdsKey]);

  /** Runs one write; every write answers with the whole list as the server now holds it. */
  const act = async (id: string, write: () => Promise<FarmRequest[]>) => {
    if (busyId) return;
    setBusyId(id);
    setActionError(null);
    try {
      setRequests(await write());
      setConfirmCancel(null);
    } catch (e) {
      setActionError(farmServicesErrorMessage(e));
      void load();
    } finally {
      setBusyId(null);
    }
  };

  const unitIsOpen = (code: string | null | undefined) => !!catalogue?.pricingUnits.find((u) => u.code === code)?.is_negotiable;

  const titleOf = (r: FarmRequest) => {
    if (r.plant) {
      const crop = localName(cropNames[r.plant.crop_id], i18n.language);
      return [crop, plantVarietyText(r.plant.variety_names, r.plant.variety_name_local, i18n.language)].filter(Boolean).join(' · ')
        || catalogueLabel('category', r.family_code);
    }
    return r.service_title || catalogueLabel('category', r.category_code ?? r.family_code);
  };

  const offerBlock = (r: FarmRequest, o: RequestOffer) => {
    const estimate = estimateText(r.quantity, r.quantity_unit, o.rate, o.pricing_unit, r.currency);
    const dayChanged = o.offer_date !== r.needed_date;
    return (
      <div key={o.id} className="space-y-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-3">
        <div>
          <p className="text-lg font-bold leading-tight text-foreground break-words">{o.public_name}</p>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            {o.distance_km != null && <span>{distanceText(o.distance_km)}</span>}
            {o.rating_count > 0 && o.rating_average != null && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-4 w-4 fill-current text-warning" aria-hidden="true" />
                {Number(o.rating_average).toFixed(1)} ({o.rating_count})
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xl font-bold text-primary">{rateText(o.rate, o.pricing_unit, r.currency)}</p>
            {estimate && <p className="text-sm text-muted-foreground">{t('farmServices.requests.total', { amount: estimate })}</p>}
          </div>
          <StatusBadge tone={dayChanged ? 'busy' : 'good'}>
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {formatDay(o.offer_date)}
          </StatusBadge>
        </div>
        {dayChanged && <p className="text-sm font-semibold text-foreground">{t('farmServices.requests.dayChanged')}</p>}
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="h-14 rounded-2xl text-base font-semibold" disabled={!!busyId || !isOnline} onClick={() => act(r.id, () => farmServicesService.declineOffer(o.id))}>
            {t('farmServices.requests.no')}
          </Button>
          <Button className="col-span-2 h-14 rounded-2xl text-lg font-bold shadow-md" disabled={!!busyId || !isOnline} onClick={() => act(r.id, () => farmServicesService.acceptOffer(o.id))}>
            <Check className="mr-2 h-5 w-5" aria-hidden="true" />
            {t('farmServices.requests.yesBook')}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <ProviderPage
      title={t('farmServices.requests.title')}
      eyebrow={t('farmServices.title')}
      backTo={FARM_SERVICES_ROUTES.home}
      pending={!requests && !loadError && isOnline}
      loadError={loadError}
      onRetry={load}
      isOnline={isOnline}
    >
      {requests && (
        <div className="space-y-3">
          {justSent && requests.length > 0 && (
            <div className="flex items-center gap-3 rounded-3xl bg-success-soft px-4 py-3" role="status">
              <CircleCheck className="h-7 w-7 shrink-0 text-success" aria-hidden="true" />
              <p className="text-base font-semibold text-foreground">{t('farmServices.requests.sentNote')}</p>
            </div>
          )}
          <SaveError message={actionError} />

          {requests.length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title={t('farmServices.requests.emptyTitle')}
              description={t('farmServices.requests.emptyDescription')}
              actionLabel={t('farmServices.requests.find')}
              onAction={() => navigate(FARM_SERVICES_ROUTES.home)}
            />
          )}

          {requests.map((r) => {
            const FamilyIcon = familyIcon(r.family_code);
            const ended = ENDED_TONE[r.status];
            const open = unitIsOpen(r.quantity_unit);
            const amount = amountText(r.quantity, r.quantity_unit, open);
            const provider = r.provider;
            const chosen = stars[r.id] ?? 0;
            const againTo = r.kind === 'NURSERY' && provider && r.status !== 'DECLINED'
              ? FARM_SERVICES_ROUTES.store(provider.account_id)
              : FARM_SERVICES_ROUTES.family(r.family_code);
            return (
              <Panel key={r.id} className="space-y-4">
                <div className="flex items-start gap-3">
                  {r.plant?.photo_path ? (
                    <img src={nurseryPhotoUrl(r.plant.photo_path)} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-2xl object-cover bg-muted" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      {r.kind === 'NURSERY' ? <TreePine className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" /> : <FamilyIcon className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold leading-tight text-foreground break-words">{titleOf(r)}</p>
                    <p className="text-sm text-muted-foreground break-words">
                      {[amount, formatDay(r.agreed_date ?? r.needed_date)].filter(Boolean).join(' · ')}
                    </p>
                    {r.land?.name && (
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="break-words">{r.land.name}</span>
                      </p>
                    )}
                  </div>
                </div>

                {ended ? (
                  <StatusBadge tone={ended}>
                    {r.status === 'CANCELLED'
                      ? t(r.cancelled_by === 'PROVIDER' ? 'farmServices.requests.cancelledByProvider' : 'farmServices.requests.cancelledByYou')
                      : t(`farmServices.requests.status.${r.status}`)}
                  </StatusBadge>
                ) : (
                  <StepRow reached={stepsReached(r)} />
                )}

                {r.status === 'OPEN' && r.offers.length === 0 && (
                  <p className="text-base text-foreground">
                    {r.is_direct && provider
                      ? t('farmServices.requests.waitingFor', { name: provider.public_name })
                      : t('farmServices.requests.waitingAll')}
                  </p>
                )}

                {r.status === 'OPEN' && r.offers.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-base font-bold text-foreground">{t('farmServices.requests.answers', { count: r.offers.length })}</p>
                    {r.offers.map((o) => offerBlock(r, o))}
                  </div>
                )}

                {(r.status === 'CONFIRMED' || r.status === 'DONE') && provider && (
                  <div className="space-y-3 rounded-2xl bg-muted p-3">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-muted-foreground">{t(r.status === 'DONE' ? 'farmServices.requests.doneBy' : 'farmServices.requests.bookedWith')}</p>
                        <p className="text-lg font-bold leading-tight text-foreground break-words">{provider.public_name}</p>
                      </div>
                      <p className="text-lg font-bold text-primary">{rateText(r.agreed_rate, r.agreed_unit, r.currency)}</p>
                    </div>
                    {r.status === 'CONFIRMED' && provider.mobile && (
                      <a
                        href={phoneLink(provider.mobile)}
                        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-md active:scale-[0.99]"
                      >
                        <Phone className="h-5 w-5" aria-hidden="true" />
                        {t('farmServices.requests.call')}
                      </a>
                    )}
                  </div>
                )}

                {r.status === 'DONE' && (
                  r.farmer_rating != null ? (
                    <p className="flex items-center gap-1" aria-label={t('farmServices.requests.yourStars', { count: r.farmer_rating })}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={cn('h-6 w-6', n <= (r.farmer_rating ?? 0) ? 'fill-current text-warning' : 'text-muted-foreground/40')} aria-hidden="true" />
                      ))}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-base font-bold text-foreground">{t('farmServices.requests.rateQuestion')}</p>
                      <div className="flex justify-between" role="group" aria-label={t('farmServices.requests.rateQuestion')}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-label={t('farmServices.requests.starN', { count: n })}
                            aria-pressed={chosen === n}
                            disabled={!!busyId}
                            onClick={() => setStars((current) => ({ ...current, [r.id]: n }))}
                            className="flex h-14 w-14 items-center justify-center rounded-full active:scale-95"
                          >
                            <Star className={cn('h-10 w-10', n <= chosen ? 'fill-current text-warning' : 'text-muted-foreground/50')} aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                      {chosen > 0 && (
                        <Button className="h-14 w-full rounded-2xl text-lg font-bold" disabled={!!busyId || !isOnline} onClick={() => act(r.id, () => farmServicesService.rateRequest(r.id, chosen))}>
                          {t('farmServices.requests.sendStars')}
                        </Button>
                      )}
                    </div>
                  )
                )}

                {(r.status === 'DECLINED' || r.status === 'EXPIRED') && (
                  <>
                    <p className="text-base text-foreground">
                      {r.status === 'DECLINED' && provider
                        ? t('farmServices.requests.declinedBy', { name: provider.public_name })
                        : t('farmServices.requests.expiredNote')}
                    </p>
                    <Button variant="outline" className="h-14 w-full rounded-2xl text-base font-semibold" onClick={() => navigate(againTo)}>
                      {t('farmServices.requests.findAnother')}
                    </Button>
                  </>
                )}

                {(r.status === 'OPEN' || r.status === 'CONFIRMED') && (
                  confirmCancel === r.id ? (
                    <div className="space-y-2 rounded-2xl bg-muted p-3">
                      <p className="text-base font-semibold text-foreground">{t('farmServices.requests.cancelQuestion')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="h-12 rounded-2xl text-base" disabled={!!busyId} onClick={() => setConfirmCancel(null)}>
                          {t('farmServices.requests.keep')}
                        </Button>
                        <Button variant="destructive" className="h-12 rounded-2xl text-base font-semibold" disabled={!!busyId || !isOnline} onClick={() => act(r.id, () => farmServicesService.cancelRequest(r.id))}>
                          {t('farmServices.requests.cancelYes')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!!busyId}
                      onClick={() => setConfirmCancel(r.id)}
                      className="min-h-[44px] w-full text-center text-base font-semibold text-muted-foreground underline underline-offset-4 disabled:opacity-60"
                    >
                      {t('farmServices.requests.cancel')}
                    </button>
                  )
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </ProviderPage>
  );
}
