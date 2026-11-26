import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronDown, Fuel, FlaskConical, UserRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  BigNumber, Field, INPUT_CLASS, NativeSelect, Panel, PrimaryAction, ProviderPage, Question, SaveError, TileGrid,
} from '@/components/provider/ProviderUi';
import { useLanguageStore } from '@/stores/languageStore';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { useServiceIcons } from '@/hooks/useServiceIcons';
import { providerWorkspaceService, type ServiceInput } from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { paymentIcon } from '@/lib/providerIcons';
import { catalogueLabel, clockValue, monthName, numberOrNull } from '@/lib/providerText';

// Same bounds as the table (20261124140100_provider_workspace_tables.sql).
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 600;
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** How many kinds of work show before "see all". */
const FAMILIES_FIRST = 8;
/** Units offered as big buttons; the rest sit under "other". */
const UNITS_FIRST = ['PER_ACRE', 'PER_HOUR', 'PER_DAY', 'PER_JOB'];

type Step = 1 | 2 | 3;

interface FormState {
  family: string;
  category: string;
  title: string;
  description: string;
  unit: string;
  rate: string;
  includesOperator: boolean;
  includesFuel: boolean;
  includesMaterial: boolean;
  minCharge: string;
  minQty: string;
  advancePercent: string;
  capacityValue: string;
  capacityUnit: string;
  capacityPeriod: string;
  travelCharge: string;
  freeTravelKm: string;
  leadTimeDays: string;
  sameDayCutoff: string;
  cancellationHours: string;
  seasonStart: string;
  seasonEnd: string;
  crewSize: string;
  skillTier: string;
  equipmentId: string;
  paymentMethods: string[];
}

const EMPTY: FormState = {
  family: '', category: '', title: '', description: '', unit: '', rate: '',
  includesOperator: false, includesFuel: false, includesMaterial: false,
  minCharge: '', minQty: '', advancePercent: '', capacityValue: '', capacityUnit: '', capacityPeriod: '',
  travelCharge: '', freeTravelKm: '', leadTimeDays: '', sameDayCutoff: '', cancellationHours: '',
  seasonStart: '', seasonEnd: '', crewSize: '', skillTier: '', equipmentId: '', paymentMethods: [],
};

const text = (value: number | null | undefined) => (value == null ? '' : String(value));

/**
 * Add or edit one service in three short screens: the work (kind, then the
 * service), the rate (number, unit, what it includes), and the rest (name,
 * note, payment; everything else under "more details"). The same fields are
 * saved as before; only the way they are asked changed.
 */
export default function ProviderServiceForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { serviceId } = useParams<{ serviceId: string }>();
  const { currentLanguage } = useLanguageStore();
  const { workspace, catalogue, loading, loadError, isOnline, saving, saveError, run, reload } = useProviderWorkspace();
  const iconFor = useServiceIcons();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [filled, setFilled] = useState(false);
  const [titleEdited, setTitleEdited] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [allFamilies, setAllFamilies] = useState(false);
  const [otherUnits, setOtherUnits] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const existing = serviceId ? workspace?.services.find((s) => s.id === serviceId) ?? null : null;

  useEffect(() => {
    if (filled || !workspace || !catalogue) return;
    if (serviceId && existing) {
      const family = catalogue.categories.find((c) => c.code === existing.category_code)?.parent_code ?? '';
      setForm({
        family, category: existing.category_code, title: existing.title, description: existing.description ?? '',
        unit: existing.pricing_unit, rate: text(existing.base_rate),
        includesOperator: existing.includes_operator, includesFuel: existing.includes_fuel,
        includesMaterial: existing.includes_material,
        minCharge: text(existing.min_charge), minQty: text(existing.min_billable_qty),
        advancePercent: text(existing.advance_percent), capacityValue: text(existing.capacity_value),
        capacityUnit: existing.capacity_unit ?? '', capacityPeriod: existing.capacity_period ?? '',
        travelCharge: text(existing.travel_charge), freeTravelKm: text(existing.free_travel_km),
        leadTimeDays: text(existing.lead_time_days), sameDayCutoff: clockValue(existing.same_day_cutoff),
        cancellationHours: text(existing.cancellation_hours),
        seasonStart: text(existing.season_start_month), seasonEnd: text(existing.season_end_month),
        crewSize: text(existing.crew_size), skillTier: existing.skill_tier ?? '',
        equipmentId: existing.equipment_id ?? '', paymentMethods: existing.payment_methods ?? [],
      });
      setTitleEdited(true);
      setAllFamilies(true);
      if (!UNITS_FIRST.includes(existing.pricing_unit)) setOtherUnits(true);
    }
    setFilled(true);
  }, [filled, workspace, catalogue, serviceId, existing]);

  const label = useMemo(() => {
    const byCode = new Map((catalogue?.categories ?? []).map((c) => [c.code, c.label_en]));
    return (code: string) => catalogueLabel('category', code, byCode.get(code));
  }, [catalogue]);
  const unitLabel = (code: string) => catalogueLabel('unit', code, catalogue?.pricingUnits.find((u) => u.code === code)?.label_en);

  const families = (catalogue?.categories ?? []).filter((c) => c.parent_code === null);
  const shownFamilies = allFamilies || families.findIndex((c) => c.code === form.family) >= FAMILIES_FIRST
    ? families
    : families.slice(0, FAMILIES_FIRST);
  const servicesOfFamily = (catalogue?.categories ?? []).filter((c) => c.parent_code === form.family);
  const units = catalogue?.pricingUnits ?? [];
  const firstUnits = UNITS_FIRST.map((code) => units.find((u) => u.code === code)).filter((u): u is NonNullable<typeof u> => !!u);
  const restUnits = units.filter((u) => !UNITS_FIRST.includes(u.code));
  const unit = units.find((u) => u.code === form.unit);
  const negotiable = !!unit?.is_negotiable;

  const chooseFamily = (code: string) =>
    setForm((f) => ({ ...f, family: f.family === code ? '' : code, category: '', title: titleEdited ? f.title : '' }));
  const chooseCategory = (code: string) => {
    // Until the person types a name, the name follows the chosen service.
    setForm((f) => ({ ...f, category: code, title: titleEdited ? f.title : label(code).slice(0, TITLE_MAX) }));
  };

  const rate = numberOrNull(form.rate);
  const capacityValue = numberOrNull(form.capacityValue);
  // Capacity is all three or none; a season is both months or none (table constraints).
  const capacityWhole = [form.capacityValue.trim(), form.capacityUnit, form.capacityPeriod].every(Boolean)
    || [form.capacityValue.trim(), form.capacityUnit, form.capacityPeriod].every((v) => !v);
  const seasonWhole = !!form.seasonStart === !!form.seasonEnd;
  const step1Done = !!form.category;
  const step2Done = !!form.unit && (negotiable || (rate != null && rate >= 0));
  const canSave = step1Done && step2Done && !!form.title.trim() && capacityWhole && seasonWhole && !saving && isOnline;

  const handleSave = async () => {
    if (!canSave) return;
    const input: ServiceInput = {
      ...(serviceId ? { id: serviceId } : {}),
      category_code: form.category,
      title: form.title.trim(),
      description: form.description.trim() || null,
      description_language: form.description.trim() ? currentLanguage : null,
      pricing_unit: form.unit,
      base_rate: negotiable ? null : rate,
      includes_operator: form.includesOperator,
      includes_fuel: form.includesFuel,
      includes_material: form.includesMaterial,
      min_charge: numberOrNull(form.minCharge),
      min_billable_qty: numberOrNull(form.minQty),
      advance_percent: numberOrNull(form.advancePercent),
      capacity_value: capacityValue,
      capacity_unit: form.capacityUnit || null,
      capacity_period: (form.capacityPeriod || null) as ServiceInput['capacity_period'],
      travel_charge: numberOrNull(form.travelCharge),
      free_travel_km: numberOrNull(form.freeTravelKm),
      lead_time_days: numberOrNull(form.leadTimeDays),
      same_day_cutoff: form.sameDayCutoff || null,
      cancellation_hours: numberOrNull(form.cancellationHours),
      season_start_month: numberOrNull(form.seasonStart),
      season_end_month: numberOrNull(form.seasonEnd),
      crew_size: numberOrNull(form.crewSize),
      skill_tier: form.skillTier || null,
      equipment_id: form.equipmentId || null,
      payment_methods: form.paymentMethods,
    };
    const ok = await run(() => providerWorkspaceService.saveService(input));
    if (ok) navigate(PROVIDER_ROUTES.services);
  };

  const notFound = !!serviceId && !!workspace && !existing;
  const numberField = (id: string, key: keyof FormState, labelKey: string, hintKey?: string, step = '1') => (
    <Field label={t(labelKey)} htmlFor={id} hint={hintKey ? t(hintKey) : undefined}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        className={INPUT_CLASS}
        disabled={saving}
      />
    </Field>
  );
  const monthOptions = MONTHS.map((m) => ({ value: String(m), label: monthName(m) }));

  const titles: Record<Step, string> = {
    1: t('provider.services.step1Title'),
    2: t('provider.services.step2Title'),
    3: t(serviceId ? 'provider.services.editTitle' : 'provider.services.step3Title'),
  };
  const back = step === 1 ? PROVIDER_ROUTES.services : undefined;

  const footer = step === 1 ? (
    <PrimaryAction onClick={() => setStep(2)} disabled={!step1Done} icon={ArrowRight}>{t('provider.common.next')}</PrimaryAction>
  ) : step === 2 ? (
    <PrimaryAction onClick={() => setStep(3)} disabled={!step2Done} icon={ArrowRight}>{t('provider.common.next')}</PrimaryAction>
  ) : (
    <PrimaryAction onClick={handleSave} disabled={!canSave} busy={saving}>{t('provider.common.save')}</PrimaryAction>
  );

  return (
    <ProviderPage
      title={titles[step]}
      backTo={back}
      step={{ current: step, total: 3 }}
      footer={workspace && catalogue && !notFound ? footer : undefined}
      pending={(loading && !workspace) || !catalogue || !filled}
      loadError={loadError ?? (notFound ? t('provider.errors.PROVIDER_SERVICE_NOT_FOUND') : null)}
      onRetry={notFound ? undefined : reload}
      isOnline={isOnline}
    >
      {workspace && catalogue && !notFound && (
        <div className="space-y-5">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="text-base font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t('provider.common.previousStep')}
            </button>
          )}
          <SaveError message={saveError} />

          {step === 1 && (
            <>
              <Question>{t('provider.services.familyQuestion')}</Question>
              <TileGrid
                label={t('provider.services.familyLabel')}
                options={shownFamilies.map((c) => ({ value: c.code, label: label(c.code), icon: iconFor(c.code) }))}
                selected={form.family ? [form.family] : []}
                onToggle={chooseFamily}
                disabled={saving}
              />
              {!allFamilies && shownFamilies.length < families.length && (
                <button
                  type="button"
                  onClick={() => setAllFamilies(true)}
                  className="flex w-full min-h-[48px] items-center justify-center gap-2 text-base font-semibold text-primary"
                >
                  {t('provider.services.seeAllFamilies', { count: families.length })}
                  <ChevronDown className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
              {form.family && (
                <>
                  <Question>{t('provider.services.categoryQuestion')}</Question>
                  <TileGrid
                    label={t('provider.services.categoryLabel')}
                    options={servicesOfFamily.map((c) => ({ value: c.code, label: label(c.code), icon: iconFor(c.code, form.family) }))}
                    selected={form.category ? [form.category] : []}
                    onToggle={chooseCategory}
                    disabled={saving}
                  />
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <Panel className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  {(() => { const Icon = iconFor(form.category, form.family); return <Icon className="h-6 w-6" aria-hidden="true" />; })()}
                </span>
                <span className="flex-1 text-lg font-bold text-foreground break-words">{label(form.category)}</span>
              </Panel>

              <Question>{t('provider.services.unitQuestion')}</Question>
              <TileGrid
                label={t('provider.services.unitLabel')}
                options={(otherUnits ? units : firstUnits).map((u) => ({ value: u.code, label: unitLabel(u.code) }))}
                selected={form.unit ? [form.unit] : []}
                onToggle={(code) => set('unit', code)}
                disabled={saving}
              />
              {!otherUnits && restUnits.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOtherUnits(true)}
                  className="flex w-full min-h-[48px] items-center justify-center gap-2 text-base font-semibold text-primary"
                >
                  {t('provider.services.otherUnits')}
                  <ChevronDown className="h-5 w-5" aria-hidden="true" />
                </button>
              )}

              {form.unit && !negotiable && (
                <>
                  <Question>{t('provider.services.rateQuestion')}</Question>
                  <BigNumber
                    id="service-rate"
                    label={t('provider.services.rateLabel')}
                    value={form.rate}
                    onChange={(v) => set('rate', v)}
                    step={50}
                    caption={unitLabel(form.unit)}
                    disabled={saving}
                  />
                </>
              )}
              {negotiable && <p className="text-base text-muted-foreground">{t('provider.services.negotiableHint')}</p>}

              {form.unit && (
                <>
                  <Question hint={t('provider.services.includesHint')}>{t('provider.services.includesQuestion')}</Question>
                  <TileGrid
                    label={t('provider.services.includesQuestion')}
                    columns={3}
                    options={[
                      { value: 'operator', label: t('provider.services.includesOperator'), icon: UserRound },
                      { value: 'fuel', label: t('provider.services.includesFuel'), icon: Fuel },
                      { value: 'material', label: t('provider.services.includesMaterial'), icon: FlaskConical },
                    ]}
                    selected={[
                      ...(form.includesOperator ? ['operator'] : []),
                      ...(form.includesFuel ? ['fuel'] : []),
                      ...(form.includesMaterial ? ['material'] : []),
                    ]}
                    onToggle={(v) => {
                      if (v === 'operator') set('includesOperator', !form.includesOperator);
                      else if (v === 'fuel') set('includesFuel', !form.includesFuel);
                      else set('includesMaterial', !form.includesMaterial);
                    }}
                    disabled={saving}
                  />
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Field label={t('provider.services.titleLabel')} htmlFor="service-title" hint={t('provider.services.titleHint')}>
                <Input
                  id="service-title"
                  value={form.title}
                  onChange={(e) => { setTitleEdited(true); set('title', e.target.value.slice(0, TITLE_MAX)); }}
                  maxLength={TITLE_MAX}
                  className={INPUT_CLASS}
                  disabled={saving}
                  required
                />
              </Field>

              <Question>{t('provider.services.paymentQuestion')}</Question>
              <TileGrid
                label={t('provider.services.paymentLabel')}
                options={catalogue.paymentMethods.map((m) => ({
                  value: m.code, label: catalogueLabel('paymentMethod', m.code, m.label_en), icon: paymentIcon(m.code),
                }))}
                selected={form.paymentMethods}
                onToggle={(code) => set('paymentMethods', form.paymentMethods.includes(code) ? form.paymentMethods.filter((c) => c !== code) : [...form.paymentMethods, code])}
                disabled={saving}
              />

              <Field
                label={t('provider.services.descriptionLabel')}
                htmlFor="service-description"
                hint={t('provider.common.charsLeft', { count: DESCRIPTION_MAX - form.description.length })}
              >
                <Textarea
                  id="service-description"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value.slice(0, DESCRIPTION_MAX))}
                  maxLength={DESCRIPTION_MAX}
                  rows={3}
                  className="text-lg rounded-2xl border-2"
                  disabled={saving}
                />
              </Field>

              <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full min-h-[64px] items-center justify-between gap-3 rounded-3xl bg-card px-4 text-left shadow-sm"
                  >
                    <span>
                      <span className="block text-base font-bold text-foreground">{t('provider.services.moreTitle')}</span>
                      <span className="block text-sm text-muted-foreground">{t('provider.services.moreHint')}</span>
                    </span>
                    <ChevronDown className={moreOpen ? 'h-6 w-6 rotate-180 text-muted-foreground' : 'h-6 w-6 text-muted-foreground'} aria-hidden="true" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-5 pt-5">
                  {numberField('service-min-charge', 'minCharge', 'provider.services.minChargeLabel', 'provider.services.minChargeHint', '0.01')}
                  {numberField('service-min-qty', 'minQty', 'provider.services.minQtyLabel', 'provider.services.minQtyHint', '0.01')}
                  {numberField('service-advance', 'advancePercent', 'provider.services.advanceLabel', 'provider.services.advanceHint')}

                  <fieldset className="space-y-3 rounded-3xl bg-card p-4 shadow-sm">
                    <legend className="px-1 text-base font-bold text-foreground">{t('provider.services.capacityTitle')}</legend>
                    {numberField('service-capacity', 'capacityValue', 'provider.services.capacityValueLabel', undefined, '0.01')}
                    <Field label={t('provider.services.capacityUnitLabel')} htmlFor="service-capacity-unit">
                      <NativeSelect
                        id="service-capacity-unit"
                        value={form.capacityUnit}
                        onChange={(value) => set('capacityUnit', value)}
                        options={units.filter((u) => !u.is_negotiable).map((u) => ({ value: u.code, label: unitLabel(u.code) }))}
                        placeholder={t('provider.common.notSet')}
                        disabled={saving}
                      />
                    </Field>
                    <Field label={t('provider.services.capacityPeriodLabel')} htmlFor="service-capacity-period">
                      <NativeSelect
                        id="service-capacity-period"
                        value={form.capacityPeriod}
                        onChange={(value) => set('capacityPeriod', value)}
                        options={[
                          { value: 'HOUR', label: t('provider.services.capacityPeriod.HOUR') },
                          { value: 'DAY', label: t('provider.services.capacityPeriod.DAY') },
                        ]}
                        placeholder={t('provider.common.notSet')}
                        disabled={saving}
                      />
                    </Field>
                    {!capacityWhole && <p className="text-sm text-destructive">{t('provider.services.capacityWhole')}</p>}
                  </fieldset>

                  {numberField('service-travel', 'travelCharge', 'provider.services.travelChargeLabel', 'provider.services.travelChargeHint', '0.01')}
                  {numberField('service-free-km', 'freeTravelKm', 'provider.services.freeTravelLabel')}
                  {numberField('service-lead', 'leadTimeDays', 'provider.services.leadTimeLabel', 'provider.services.leadTimeHint')}

                  <Field label={t('provider.services.cutoffLabel')} htmlFor="service-cutoff" hint={t('provider.services.cutoffHint')}>
                    <Input
                      id="service-cutoff"
                      type="time"
                      value={form.sameDayCutoff}
                      onChange={(e) => set('sameDayCutoff', e.target.value)}
                      className={INPUT_CLASS}
                      disabled={saving}
                    />
                  </Field>

                  {numberField('service-cancel', 'cancellationHours', 'provider.services.cancellationLabel', 'provider.services.cancellationHint')}

                  <fieldset className="space-y-3 rounded-3xl bg-card p-4 shadow-sm">
                    <legend className="px-1 text-base font-bold text-foreground">{t('provider.services.seasonTitle')}</legend>
                    <Field label={t('provider.services.seasonStartLabel')} htmlFor="service-season-start">
                      <NativeSelect id="service-season-start" value={form.seasonStart} onChange={(v) => set('seasonStart', v)} options={monthOptions} placeholder={t('provider.services.allYear')} disabled={saving} />
                    </Field>
                    <Field label={t('provider.services.seasonEndLabel')} htmlFor="service-season-end">
                      <NativeSelect id="service-season-end" value={form.seasonEnd} onChange={(v) => set('seasonEnd', v)} options={monthOptions} placeholder={t('provider.services.allYear')} disabled={saving} />
                    </Field>
                    {!seasonWhole && <p className="text-sm text-destructive">{t('provider.services.seasonWhole')}</p>}
                  </fieldset>

                  {numberField('service-crew', 'crewSize', 'provider.services.crewLabel')}

                  <Field label={t('provider.services.skillLabel')} htmlFor="service-skill">
                    <NativeSelect
                      id="service-skill"
                      value={form.skillTier}
                      onChange={(value) => set('skillTier', value)}
                      options={catalogue.skillTiers.map((s) => ({ value: s.code, label: catalogueLabel('skillTier', s.code, s.label_en) }))}
                      placeholder={t('provider.common.notSet')}
                      disabled={saving}
                    />
                  </Field>

                  {workspace.equipment.length > 0 && (
                    <Field label={t('provider.services.equipmentLabel')} htmlFor="service-equipment">
                      <NativeSelect
                        id="service-equipment"
                        value={form.equipmentId}
                        onChange={(value) => set('equipmentId', value)}
                        options={workspace.equipment.map((e) => ({
                          value: e.id,
                          label: [
                            catalogueLabel('equipmentType', e.equipment_type, catalogue.equipmentTypes.find((x) => x.code === e.equipment_type)?.label_en),
                            e.make, e.model,
                          ].filter(Boolean).join(' · '),
                        }))}
                        placeholder={t('provider.common.notSet')}
                        disabled={saving}
                      />
                    </Field>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </div>
      )}
    </ProviderPage>
  );
}
