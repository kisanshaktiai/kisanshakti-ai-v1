import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays, Check, CheckCheck, Inbox, Lock, MapPin, Navigation, Phone, Star, TreePine, User, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/layout/EmptyState';
import {
  BigNumber, Field, INPUT_CLASS, Panel, ProviderPage, SaveError, StatusBadge,
} from '@/components/provider/ProviderUi';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useProviderRequestsInbox } from '@/hooks/useProviderRequestsInbox';
import { useServiceCatalogue } from '@/hooks/useServiceCatalogue';
import {
  providerRequestsService, type ProviderInbox, type ProviderRequestCard,
} from '@/services/providerRequestsService';
import { nurseryPhotoUrl } from '@/services/nurseryPhotoService';
import { localName, providerWorkspaceService, type LocalNames } from '@/services/providerWorkspaceService';
import { amountText, dayValue, estimateText, phoneLink, plantVarietyText, rateText } from '@/lib/farmServicesText';
import { familyIcon } from '@/lib/providerIcons';
import { catalogueLabel, formatDay, numberOrNull, providerErrorMessage } from '@/lib/providerText';
import { cn } from '@/lib/utils';

/** Opens the phone's map at a place. */
function mapLink(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

/** A sensible plus/minus step for a rate of this size. */
function rateStep(rate: number | null): number {
  if (rate == null) return 50;
  return rate >= 500 ? 50 : rate >= 50 ? 10 : 1;
}

/** The provider's own rate and unit for a request: what the farmer saw, or his service's. */
function myTerms(r: ProviderRequestCard): { rate: number | null; unit: string | null } {
  return r.is_direct
    ? { rate: r.quoted_rate, unit: r.quantity_unit }
    : { rate: r.my_service?.base_rate ?? null, unit: r.my_service?.pricing_unit ?? null };
}

function SectionTitle({ icon: Icon, children, count }: { icon: LucideIcon; children: string; count: number }) {
  return (
    <h2 className="flex items-center gap-2 pt-2 text-lg font-bold text-foreground">
      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      {children}
      <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-primary/10 px-2 text-sm font-bold text-primary">{count}</span>
    </h2>
  );
}

/**
 * Requests from farmers. New ones are answered with one tap: yes as asked,
 * yes with his own rate or day, or no. A booked job shows who the farmer is,
 * where the land lies and a button to call; the day the work is finished the
 * provider marks it done and the farmer is asked for stars.
 */
export default function ProviderRequests() {
  const { t, i18n } = useTranslation();
  const isOnline = useOfflineStatus();
  const { catalogue } = useServiceCatalogue();
  // The workspace shell reads the inbox every minute; this screen reads it once more on opening.
  const { inbox, error: loadFailure, reload } = useProviderRequestsInbox(false);
  useEffect(() => { if (isOnline) void reload(); }, [isOnline, reload]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [change, setChange] = useState<{ id: string; rate: string; date: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [cropNames, setCropNames] = useState<Record<string, LocalNames>>({});

  const all = inbox ? [...inbox.new, ...inbox.waiting, ...inbox.jobs, ...inbox.past] : [];
  const cropIdsKey = Array.from(new Set(all.map((r) => r.plant?.crop_id).filter(Boolean) as string[])).sort().join(',');
  useEffect(() => {
    if (!cropIdsKey) return;
    let cancelled = false;
    providerWorkspaceService.cropNames(cropIdsKey.split(','))
      .then((names) => { if (!cancelled) setCropNames((current) => ({ ...current, ...names })); })
      .catch(() => { /* the plant shows by its variety alone */ });
    return () => { cancelled = true; };
  }, [cropIdsKey]);

  /** Runs one write; every write answers with the whole inbox, kept by the service. */
  const act = async (id: string, write: () => Promise<ProviderInbox>) => {
    if (busyId) return;
    setBusyId(id);
    setActionError(null);
    try {
      await write();
      setChange(null);
      setConfirmCancel(null);
    } catch (e) {
      setActionError(providerErrorMessage(e));
      void reload();
    } finally {
      setBusyId(null);
    }
  };

  const unitIsOpen = (code: string | null | undefined) => !!catalogue?.pricingUnits.find((u) => u.code === code)?.is_negotiable;
  const unitLabel = (code: string | null | undefined) =>
    catalogueLabel('unit', code, catalogue?.pricingUnits.find((u) => u.code === code)?.label_en);

  const titleOf = (r: ProviderRequestCard) => {
    if (r.plant) {
      const crop = localName(cropNames[r.plant.crop_id], i18n.language);
      return [crop, plantVarietyText(r.plant.variety_names, r.plant.variety_name_local, i18n.language)].filter(Boolean).join(' · ')
        || catalogueLabel('category', r.family_code);
    }
    return r.my_service?.title || catalogueLabel('category', r.category_code ?? r.family_code);
  };

  /** Top of every card: picture, the work, how much, which day, how far. */
  const head = (r: ProviderRequestCard, day: string) => {
    const FamilyIcon = familyIcon(r.family_code);
    const amount = amountText(r.quantity, r.quantity_unit, unitIsOpen(r.quantity_unit));
    return (
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
          {amount && <p className="text-xl font-bold text-primary">{amount}</p>}
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />{formatDay(day)}
            </span>
            {r.distance_km != null && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" aria-hidden="true" />{t('provider.requests.aboutKm', { count: r.distance_km })}
              </span>
            )}
          </p>
        </div>
      </div>
    );
  };

  const cancelBlock = (r: ProviderRequestCard, questionKey: string, buttonKey: string) => (
    confirmCancel === r.id ? (
      <div className="space-y-2 rounded-2xl bg-muted p-3">
        <p className="text-base font-semibold text-foreground">{t(questionKey)}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12 rounded-2xl text-base" disabled={!!busyId} onClick={() => setConfirmCancel(null)}>
            {t('provider.requests.keep')}
          </Button>
          <Button variant="destructive" className="h-12 rounded-2xl text-base font-semibold" disabled={!!busyId || !isOnline} onClick={() => act(r.id, () => providerRequestsService.cancel(r.id))}>
            {t('provider.requests.cancelYes')}
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
        {t(buttonKey)}
      </button>
    )
  );

  const newCard = (r: ProviderRequestCard) => {
    const { rate, unit } = myTerms(r);
    const estimate = estimateText(r.quantity, r.quantity_unit, rate, unit, r.currency);
    const changing = change?.id === r.id ? change : null;
    const offerRate = changing ? numberOrNull(changing.rate) : null;
    const offerValid = !!changing && offerRate != null && offerRate >= 0 && !!changing.date && changing.date >= dayValue(0);
    const hasRate = rate != null && !unitIsOpen(unit);
    return (
      <Panel key={r.id} className="space-y-4 border-2 border-primary/40">
        {head(r, r.needed_date)}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge tone={r.is_direct ? 'neutral' : 'busy'}>
            {t(r.is_direct ? 'provider.requests.forYou' : 'provider.requests.forAll')}
          </StatusBadge>
          {hasRate && (
            <p className="text-right">
              <span className="block text-base font-bold text-foreground">{rateText(rate, unit, r.currency)}</span>
              {estimate && <span className="block text-sm text-muted-foreground">{t('provider.requests.total', { amount: estimate })}</span>}
            </p>
          )}
        </div>

        {changing ? (
          <div className="space-y-3">
            <BigNumber
              id={`offer-rate-${r.id}`}
              label={t('provider.requests.yourRate', { unit: unitLabel(unit) })}
              value={changing.rate}
              onChange={(value) => setChange({ ...changing, rate: value })}
              step={rateStep(rate)}
              disabled={!!busyId}
            />
            <Field label={t('provider.requests.yourDay')} htmlFor={`offer-day-${r.id}`}>
              <Input
                id={`offer-day-${r.id}`}
                type="date"
                min={dayValue(0)}
                value={changing.date}
                onChange={(e) => setChange({ ...changing, date: e.target.value })}
                className={INPUT_CLASS}
                disabled={!!busyId}
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="h-14 rounded-2xl text-base font-semibold" disabled={!!busyId} onClick={() => setChange(null)}>
                {t('provider.common.back')}
              </Button>
              <Button
                className="col-span-2 h-14 rounded-2xl text-lg font-bold shadow-md"
                disabled={!offerValid || !!busyId || !isOnline}
                onClick={() => act(r.id, () => providerRequestsService.respond(r.id, { action: 'OFFER', rate: offerRate as number, offer_date: changing.date }))}
              >
                {t('provider.requests.sendAnswer')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {hasRate ? (
              <Button className="h-14 w-full rounded-2xl text-lg font-bold shadow-md" disabled={!!busyId || !isOnline} onClick={() => act(r.id, () => providerRequestsService.respond(r.id, { action: 'ACCEPT' }))}>
                <Check className="mr-2 h-5 w-5" aria-hidden="true" />
                {t('provider.requests.yes')}
              </Button>
            ) : (
              <Button className="h-14 w-full rounded-2xl text-lg font-bold shadow-md" disabled={!!busyId || !isOnline} onClick={() => setChange({ id: r.id, rate: '', date: r.needed_date })}>
                {t('provider.requests.giveRate')}
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-14 rounded-2xl text-base font-semibold" disabled={!!busyId || !isOnline} onClick={() => act(r.id, () => providerRequestsService.respond(r.id, { action: 'REFUSE' }))}>
                {t('provider.requests.no')}
              </Button>
              {hasRate && (
                <Button variant="outline" className="h-14 rounded-2xl text-base font-semibold" disabled={!!busyId || !isOnline} onClick={() => setChange({ id: r.id, rate: String(rate), date: r.needed_date })}>
                  {t('provider.requests.change')}
                </Button>
              )}
            </div>
          </div>
        )}
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t('provider.requests.privacy')}
        </p>
      </Panel>
    );
  };

  const waitingCard = (r: ProviderRequestCard) => (
    <Panel key={r.id} className="space-y-3">
      {head(r, r.my_offer?.offer_date ?? r.needed_date)}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge tone="busy">{t('provider.requests.waitingFarmer')}</StatusBadge>
        {r.my_offer && <p className="text-base font-bold text-foreground">{rateText(r.my_offer.rate, r.my_offer.pricing_unit, r.currency)}</p>}
      </div>
      {cancelBlock(r, 'provider.requests.takeBackQuestion', 'provider.requests.takeBack')}
    </Panel>
  );

  const jobCard = (r: ProviderRequestCard) => {
    const day = r.agreed_date ?? r.needed_date;
    const canFinish = day <= dayValue(0);
    const estimate = estimateText(r.quantity, r.quantity_unit, r.agreed_rate, r.agreed_unit, r.currency);
    const farmer = r.farmer;
    return (
      <Panel key={r.id} className="space-y-4">
        {head(r, day)}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge tone="good">{t('provider.requests.booked')}</StatusBadge>
          <p className="text-right">
            <span className="block text-base font-bold text-foreground">{rateText(r.agreed_rate, r.agreed_unit, r.currency)}</span>
            {estimate && <span className="block text-sm text-muted-foreground">{t('provider.requests.total', { amount: estimate })}</span>}
          </p>
        </div>
        {farmer && (
          <div className="space-y-3 rounded-2xl bg-muted p-3">
            <div className="flex items-start gap-3">
              <User className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-lg font-bold leading-tight text-foreground break-words">{farmer.name || t('provider.requests.farmer')}</p>
                <p className="text-sm text-muted-foreground break-words">{[farmer.land_name, farmer.village].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className={cn('grid gap-2', farmer.mobile && farmer.lat != null && farmer.lon != null ? 'grid-cols-2' : 'grid-cols-1')}>
              {farmer.mobile && (
                <a href={phoneLink(farmer.mobile)} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-md active:scale-[0.99]">
                  <Phone className="h-5 w-5" aria-hidden="true" />
                  {t('provider.requests.call')}
                </a>
              )}
              {farmer.lat != null && farmer.lon != null && (
                <a href={mapLink(farmer.lat, farmer.lon)} target="_blank" rel="noopener noreferrer" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-card text-lg font-bold text-foreground shadow-sm active:scale-[0.99]">
                  <Navigation className="h-5 w-5" aria-hidden="true" />
                  {t('provider.requests.way')}
                </a>
              )}
            </div>
          </div>
        )}
        <Button className="h-14 w-full rounded-2xl text-lg font-bold" disabled={!canFinish || !!busyId || !isOnline} onClick={() => act(r.id, () => providerRequestsService.done(r.id))}>
          <CheckCheck className="mr-2 h-5 w-5" aria-hidden="true" />
          {t(r.kind === 'NURSERY' ? 'provider.requests.given' : 'provider.requests.workDone')}
        </Button>
        {!canFinish && <p className="text-sm text-muted-foreground">{t('provider.requests.doneFrom', { date: formatDay(day) })}</p>}
        {cancelBlock(r, 'provider.requests.cancelQuestion', 'provider.requests.cancelJob')}
      </Panel>
    );
  };

  const pastRow = (r: ProviderRequestCard) => (
    <Panel key={r.id} className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold leading-tight text-foreground break-words">{titleOf(r)}</p>
        <p className="text-sm text-muted-foreground break-words">
          {[r.farmer?.name, formatDay(r.agreed_date ?? r.needed_date)].filter(Boolean).join(' · ')}
        </p>
      </div>
      {r.status === 'DONE' ? (
        <StatusBadge tone="good">
          {t('provider.requests.done')}
          {r.farmer_rating != null && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="h-4 w-4 fill-current text-warning" aria-hidden="true" />{r.farmer_rating}
            </span>
          )}
        </StatusBadge>
      ) : (
        <StatusBadge tone="off">
          {t(r.cancelled_by === 'FARMER' ? 'provider.requests.cancelledByFarmer' : 'provider.requests.cancelledByYou')}
        </StatusBadge>
      )}
    </Panel>
  );

  const empty = !!inbox && all.length === 0;

  return (
    <ProviderPage
      title={t('provider.requests.title')}
      eyebrow={t('identity.roles.SERVICE_PROVIDER.name')}
      pending={!inbox && !loadFailure && isOnline}
      loadError={!inbox && loadFailure ? providerErrorMessage(loadFailure) : null}
      onRetry={reload}
      isOnline={isOnline}
    >
      {inbox && (
        <div className="space-y-3">
          <SaveError message={actionError} />
          {empty && (
            <EmptyState
              icon={Inbox}
              title={t('identity.home.SERVICE_PROVIDER.requestsTitle')}
              description={t('identity.home.SERVICE_PROVIDER.requestsDescription')}
            />
          )}
          {inbox.new.length > 0 && (
            <>
              <SectionTitle icon={Inbox} count={inbox.new.length}>{t('provider.requests.sections.new')}</SectionTitle>
              {inbox.new.map(newCard)}
            </>
          )}
          {inbox.jobs.length > 0 && (
            <>
              <SectionTitle icon={Check} count={inbox.jobs.length}>{t('provider.requests.sections.jobs')}</SectionTitle>
              {inbox.jobs.map(jobCard)}
            </>
          )}
          {inbox.waiting.length > 0 && (
            <>
              <SectionTitle icon={CalendarDays} count={inbox.waiting.length}>{t('provider.requests.sections.waiting')}</SectionTitle>
              {inbox.waiting.map(waitingCard)}
            </>
          )}
          {inbox.past.length > 0 && (
            <>
              <SectionTitle icon={CheckCheck} count={inbox.past.length}>{t('provider.requests.sections.past')}</SectionTitle>
              {inbox.past.map(pastRow)}
            </>
          )}
        </div>
      )}
    </ProviderPage>
  );
}
