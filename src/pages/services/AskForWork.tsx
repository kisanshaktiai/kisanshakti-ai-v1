import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Lock, MapPinOff, TreePine } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/layout/EmptyState';
import {
  BigNumber, ChoiceChips, INPUT_CLASS, Panel, PrimaryAction, ProviderPage, Question, SaveError, TileGrid,
} from '@/components/provider/ProviderUi';
import { useLands } from '@/hooks/useLands';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useServiceCatalogue } from '@/hooks/useServiceCatalogue';
import { useServiceIcons } from '@/hooks/useServiceIcons';
import { useFarmServicesStore } from '@/stores/farmServicesStore';
import { farmServicesService, type FarmRequestInput } from '@/services/farmServicesService';
import { nurseryPhotoUrl } from '@/services/nurseryPhotoService';
import { FARM_SERVICES_ROUTES } from '@/lib/farmServicesRoutes';
import { amountText, dayValue, estimateText, farmServicesErrorMessage, rateText } from '@/lib/farmServicesText';
import { catalogueLabel, formatDay } from '@/lib/providerText';

/** The land unit a land's own size is kept in. */
const LAND_SIZE_UNIT = 'PER_ACRE';

type DayChoice = 'today' | 'tomorrow' | 'other';

interface LandOption { id: string; name: string; acres: number; located: boolean; }

/**
 * Ask for work: which land, which day, how much. Every answer starts filled
 * in (the first land, tomorrow, the land's own size), so most farmers only
 * read and press Send. The same three questions serve a provider's service, a
 * request to every provider near the land, and plants from a nursery.
 */
export default function AskForWork() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOnline = useOfflineStatus();
  const draft = useFarmServicesStore((s) => s.draft);
  const { lands, isLoading } = useLands();
  const { catalogue, error: catalogueError } = useServiceCatalogue();
  const iconFor = useServiceIcons();

  const landOptions: LandOption[] = useMemo(
    () => (lands ?? [])
      .filter((l) => !!l.id)
      .map((l) => ({
        id: String(l.id), name: l.name, acres: Number(l.area_acres) || 0,
        located: l.center_lat != null && l.center_lon != null,
      })),
    [lands],
  );
  const usable = landOptions.filter((l) => l.located);

  const plant = draft?.plant;
  const firstDay = plant?.firstReadyDate && plant.availableNow === 0 && plant.firstReadyDate > dayValue(0)
    ? plant.firstReadyDate : null;

  const [landId, setLandId] = useState('');
  const [category, setCategory] = useState(draft?.service?.categoryCode ?? draft?.categories?.[0]?.code ?? '');
  const [day, setDay] = useState<DayChoice>(firstDay ? 'other' : 'tomorrow');
  const [otherDate, setOtherDate] = useState(firstDay ?? dayValue(2));
  const [quantity, setQuantity] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unit = draft?.kind === 'NURSERY'
    ? plant?.unit ?? ''
    : draft?.service?.unit ?? draft?.categories?.find((c) => c.code === category)?.unit ?? '';
  const rate = draft?.kind === 'NURSERY' ? plant?.price ?? null : draft?.service?.rate ?? null;
  const currency = plant?.currency ?? draft?.service?.currency ?? 'INR';
  const land = usable.find((l) => l.id === landId);
  const unitRow = catalogue?.pricingUnits.find((u) => u.code === unit);
  const unitName = catalogueLabel('unit', unit, unitRow?.label_en);
  // Square metres in the unit asked and in the unit lands are measured in, from the catalogue.
  const unitSqm = Number(unitRow?.area_sqm) || 0;
  const landSqm = Number(catalogue?.pricingUnits.find((u) => u.code === LAND_SIZE_UNIT)?.area_sqm) || 0;
  const perArea = unitSqm > 0;
  // A rate settled by talking has no amount to ask; the provider answers with his rate.
  const openRate = !!unitRow?.is_negotiable;
  const landAmount = land && perArea && landSqm > 0 && land.acres > 0
    ? Math.round(((land.acres * landSqm) / unitSqm) * 100) / 100
    : null;

  // The first located land is chosen for the farmer.
  useEffect(() => {
    if (!landId && usable.length > 0) setLandId(usable[0].id);
  }, [landId, usable]);

  // Until the farmer changes it, the amount follows the land (area work) or the smallest order (plants).
  useEffect(() => {
    if (touched || !draft) return;
    if (draft.kind === 'NURSERY') {
      setQuantity(String(Math.max(plant?.minOrder ?? 1, Math.min(100, plant?.availableNow || 100))));
      return;
    }
    setQuantity(landAmount != null ? String(landAmount) : '1');
  }, [touched, draft, plant, landAmount]);

  if (!draft) return <Navigate to={FARM_SERVICES_ROUTES.home} replace />;

  const neededDate = day === 'today' ? dayValue(0) : day === 'tomorrow' ? dayValue(1) : otherDate;
  const amount = openRate ? 1 : Number(quantity);
  const amountValid = openRate || (quantity.trim() !== '' && amount > 0 && (draft.kind !== 'NURSERY' || Number.isInteger(amount)));
  const dateValid = !!neededDate && neededDate >= dayValue(0);
  const canSend = !!landId && !!unit && amountValid && dateValid && (draft.kind === 'NURSERY' || !!category) && !sending && isOnline;
  const estimate = amountValid && !openRate ? estimateText(amount, unit, rate, unit, currency) : null;
  const FamilyIcon = iconFor(category || draft.familyCode, draft.familyCode);
  const backTo = draft.kind === 'NURSERY' && draft.provider
    ? FARM_SERVICES_ROUTES.store(draft.provider.accountId)
    : FARM_SERVICES_ROUTES.family(draft.familyCode);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const input: FarmRequestInput = {
      kind: draft.kind, land_id: landId, needed_date: neededDate, quantity: amount,
      ...(draft.kind === 'NURSERY'
        ? { nursery_product_id: plant?.productId }
        : draft.service
          ? { provider_service_id: draft.service.id }
          : { category_code: category, quantity_unit: unit }),
    };
    try {
      await farmServicesService.createRequest(input);
      useFarmServicesStore.getState().setDraft(null);
      navigate(FARM_SERVICES_ROUTES.requests, { replace: true, state: { sent: true } });
    } catch (e) {
      setError(farmServicesErrorMessage(e));
      setSending(false);
    }
  };

  const summaryTitle = draft.kind === 'NURSERY'
    ? [plant?.cropName, plant?.variety].filter(Boolean).join(' · ')
    : draft.service?.title ?? catalogueLabel('category', category);

  return (
    <ProviderPage
      title={t(draft.kind === 'NURSERY' ? 'farmServices.ask.titlePlants' : 'farmServices.ask.title')}
      eyebrow={draft.provider?.name ?? t('farmServices.ask.toEveryone')}
      backTo={backTo}
      pending={!catalogue || (isLoading && landOptions.length === 0)}
      loadError={catalogueError}
      isOnline={isOnline}
      footer={usable.length > 0 ? (
        <PrimaryAction onClick={send} disabled={!canSend} busy={sending} icon={ArrowRight}>
          {t('farmServices.ask.send')}
        </PrimaryAction>
      ) : undefined}
    >
      {usable.length === 0 ? (
        <EmptyState icon={MapPinOff} title={t('farmServices.notLocatedTitle')} description={t('farmServices.notLocatedDescription')} />
      ) : (
        <div className="space-y-5">
          <SaveError message={error} />

          <Panel className="flex items-center gap-3">
            {plant?.photoPath ? (
              <img src={nurseryPhotoUrl(plant.photoPath)} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover bg-muted" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                {draft.kind === 'NURSERY' ? <TreePine className="h-7 w-7" aria-hidden="true" /> : <FamilyIcon className="h-7 w-7" aria-hidden="true" />}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold leading-tight text-foreground break-words">{summaryTitle}</p>
              <p className="text-base font-semibold text-primary">{rate == null ? (unitName || t('farmServices.rateOnAsk')) : rateText(rate, unit, currency)}</p>
            </div>
          </Panel>

          {!draft.service && draft.kind === 'SERVICE' && (draft.categories?.length ?? 0) > 1 && (
            <>
              <Question>{t('farmServices.ask.whichService')}</Question>
              <ChoiceChips
                label={t('farmServices.ask.whichService')}
                options={(draft.categories ?? []).map((c) => ({ value: c.code, label: catalogueLabel('category', c.code) }))}
                selected={category ? [category] : []}
                onToggle={(code) => setCategory(code)}
                disabled={sending}
              />
            </>
          )}

          <Question>{t('farmServices.ask.whichLand')}</Question>
          <TileGrid
            label={t('farmServices.ask.whichLand')}
            options={usable.map((l) => ({
              value: l.id, label: l.name,
              detail: l.acres > 0 ? amountText(l.acres, LAND_SIZE_UNIT) : undefined,
            }))}
            selected={landId ? [landId] : []}
            onToggle={(id) => setLandId(id)}
            disabled={sending}
          />

          <Question>{t(draft.kind === 'NURSERY' ? 'farmServices.ask.whenPlants' : 'farmServices.ask.when')}</Question>
          <TileGrid
            label={t('farmServices.ask.when')}
            columns={3}
            options={[
              { value: 'today', label: t('farmServices.ask.today') },
              { value: 'tomorrow', label: t('farmServices.ask.tomorrow') },
              { value: 'other', label: day === 'other' && otherDate ? formatDay(otherDate) : t('farmServices.ask.otherDay') },
            ]}
            selected={[day]}
            onToggle={(value) => setDay(value as DayChoice)}
            disabled={sending}
          />
          {day === 'other' && (
            <Input
              type="date"
              aria-label={t('farmServices.ask.otherDay')}
              min={dayValue(0)}
              value={otherDate}
              onChange={(e) => setOtherDate(e.target.value)}
              className={INPUT_CLASS}
              disabled={sending}
            />
          )}

          {!openRate && (
            <>
              <Question>{t(draft.kind === 'NURSERY' ? 'farmServices.ask.howManyPlants' : 'farmServices.ask.howMuch')}</Question>
              <BigNumber
                id="ask-quantity"
                label={unitName || t('farmServices.ask.howMuch')}
                value={quantity}
                onChange={(v) => { setTouched(true); setQuantity(v); }}
                step={draft.kind === 'NURSERY' ? 50 : perArea ? 0.5 : 1}
                min={draft.kind === 'NURSERY' ? Math.max(1, plant?.minOrder ?? 1) : perArea ? 0.5 : 1}
                caption={draft.kind === 'NURSERY' && plant
                  ? plant.availableNow > 0
                    ? t('farmServices.readyNow', { count: plant.availableNow })
                    : plant.firstReadyDate ? t('farmServices.ask.readyFrom', { date: formatDay(plant.firstReadyDate) }) : undefined
                  : undefined}
                disabled={sending}
              />
            </>
          )}

          {estimate && (
            <div className="flex items-center justify-between rounded-3xl bg-primary/10 px-5 py-4">
              <span className="text-base font-semibold text-foreground">{t('farmServices.ask.about')}</span>
              <span className="text-2xl font-bold text-primary">{estimate}</span>
            </div>
          )}

          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('farmServices.ask.privacy')}
          </p>
        </div>
      )}
    </ProviderPage>
  );
}
