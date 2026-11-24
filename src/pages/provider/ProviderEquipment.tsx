import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Plus, Tractor, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/layout/EmptyState';
import {
  Field, INPUT_CLASS, NativeSelect, ProviderPage, SaveError, SwitchRow,
} from '@/components/provider/ProviderUi';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import {
  providerWorkspaceService, type EquipmentInput, type ProviderCatalogue, type ProviderEquipment as Equipment,
} from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { catalogueLabel, numberOrNull } from '@/lib/providerText';

// Same bounds and choices as the table (20261124140100_provider_workspace_tables.sql).
const TEXT_MAX = 60;
const YEAR_MIN = 1950;
const OWNERSHIPS = ['OWNED', 'LEASED', 'RENTED'] as const;
const CONDITIONS = ['NEW', 'GOOD', 'FAIR'] as const;

interface FormState {
  id?: string;
  type: string;
  make: string;
  model: string;
  year: string;
  ownership: string;
  condition: string;
  registration: string;
  attributes: Record<string, string | boolean>;
}

const EMPTY: FormState = {
  type: '', make: '', model: '', year: '', ownership: 'OWNED', condition: '', registration: '', attributes: {},
};

function typeLabel(catalogue: ProviderCatalogue, code: string): string {
  return catalogueLabel('equipmentType', code, catalogue.equipmentTypes.find((e) => e.code === code)?.label_en);
}

/** "Tractor · make · model" for a list row. */
function equipmentTitle(catalogue: ProviderCatalogue, item: Equipment): string {
  return [typeLabel(catalogue, item.equipment_type), item.make, item.model].filter(Boolean).join(' · ');
}

/**
 * Equipment the provider works with. The fields of a machine depend on its
 * type (the attribute list comes with the type from the catalogue). Only the
 * last four characters of a registration number are ever kept.
 */
export default function ProviderEquipment() {
  const { t } = useTranslation();
  const {
    workspace, catalogue, loading, loadError, isOnline, saving, saveError, clearSaveError, run, reload,
  } = useProviderWorkspace();
  const [form, setForm] = useState<FormState | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const openNew = () => { clearSaveError(); setForm(EMPTY); };
  const openEdit = (item: Equipment) => {
    clearSaveError();
    const attributes: Record<string, string | boolean> = {};
    for (const [code, value] of Object.entries(item.attributes ?? {})) {
      attributes[code] = typeof value === 'boolean' ? value : String(value);
    }
    setForm({
      id: item.id, type: item.equipment_type, make: item.make ?? '', model: item.model ?? '',
      year: item.year_made != null ? String(item.year_made) : '', ownership: item.ownership,
      condition: item.condition ?? '', registration: '', attributes,
    });
  };

  const definitions = catalogue?.equipmentTypes.find((e) => e.code === form?.type)?.attribute_definitions ?? [];
  const year = numberOrNull(form?.year ?? '');
  const yearValid = year == null || (Number.isInteger(year) && year >= YEAR_MIN && year <= new Date().getFullYear() + 1);
  const canSave = !!form?.type && yearValid && !saving && isOnline;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !canSave) return;
    // Send only the attributes this type defines, each as the kind of value it defines.
    const attributes: Record<string, number | string | boolean> = {};
    for (const definition of definitions) {
      const value = form.attributes[definition.code];
      if (definition.type === 'boolean') {
        if (typeof value === 'boolean') attributes[definition.code] = value;
      } else if (definition.type === 'number') {
        const n = numberOrNull(typeof value === 'string' ? value : '');
        if (n != null) attributes[definition.code] = n;
      } else if (typeof value === 'string' && value.trim()) {
        attributes[definition.code] = value.trim().slice(0, TEXT_MAX);
      }
    }
    const input: EquipmentInput = {
      ...(form.id ? { id: form.id } : {}),
      equipment_type: form.type,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      year_made: year,
      attributes,
      ownership: form.ownership as EquipmentInput['ownership'],
      condition: (form.condition || null) as EquipmentInput['condition'],
      ...(form.registration.trim() ? { registration: form.registration.trim() } : {}),
    };
    const ok = await run(() => providerWorkspaceService.saveEquipment(input));
    if (ok) setForm(null);
  };

  const equipment = workspace?.equipment ?? [];

  return (
    <ProviderPage
      title={t('provider.equipment.title')}
      backTo={PROVIDER_ROUTES.business}
      pending={(loading && !workspace) || !catalogue}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
    >
      {workspace && catalogue && (
        <>
          {!form && <SaveError message={saveError} />}

          <Button className="w-full h-12 text-base" onClick={openNew} disabled={!isOnline}>
            <Plus className="w-5 h-5 mr-2" aria-hidden="true" />
            {t('provider.equipment.add')}
          </Button>

          {equipment.length === 0 && (
            <EmptyState
              icon={Tractor}
              title={t('provider.equipment.emptyTitle')}
              description={t('provider.equipment.emptyDescription')}
            />
          )}

          {equipment.map((item) => (
            <Card key={item.id} className="p-4 space-y-3">
              <div>
                <p className="text-base font-semibold text-foreground break-words">{equipmentTitle(catalogue, item)}</p>
                <p className="text-sm text-muted-foreground break-words">
                  {[
                    t(`provider.equipment.ownership.${item.ownership}`),
                    item.year_made != null ? String(item.year_made) : null,
                    item.registration_last4 ? t('provider.equipment.registrationEnding', { last4: item.registration_last4 }) : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-12" onClick={() => openEdit(item)} disabled={!isOnline}>
                  <Pencil className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  {t('provider.common.edit')}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="h-12" disabled={saving || !isOnline}>
                      <Trash2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
                      {t('provider.common.remove')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('provider.equipment.removeTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>{t('provider.equipment.removeDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="h-12">{t('provider.common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction className="h-12" onClick={() => run(() => providerWorkspaceService.removeEquipment(item.id))}>
                        {t('provider.common.remove')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </Card>
          ))}

          <Sheet open={!!form} onOpenChange={(open) => { if (!open) setForm(null); }}>
            <SheetContent side="bottom" className="rounded-t-3xl pb-safe max-h-[92vh] overflow-y-auto">
              <SheetHeader className="text-left mb-4">
                <SheetTitle>{t(form?.id ? 'provider.equipment.editTitle' : 'provider.equipment.add')}</SheetTitle>
              </SheetHeader>
              {form && (
                <form onSubmit={handleSave} className="space-y-5">
                  <SaveError message={saveError} />

                  <Field label={t('provider.equipment.typeLabel')} htmlFor="equipment-type">
                    <NativeSelect
                      id="equipment-type"
                      value={form.type}
                      onChange={(type) => setForm((f) => (f ? { ...f, type, attributes: {} } : f))}
                      options={catalogue.equipmentTypes.map((e) => ({ value: e.code, label: typeLabel(catalogue, e.code) }))}
                      placeholder={t('provider.common.choose')}
                      disabled={saving}
                    />
                  </Field>

                  <Field label={t('provider.equipment.makeLabel')} htmlFor="equipment-make">
                    <Input id="equipment-make" value={form.make} onChange={(e) => set('make', e.target.value.slice(0, TEXT_MAX))} maxLength={TEXT_MAX} className={INPUT_CLASS} disabled={saving} />
                  </Field>
                  <Field label={t('provider.equipment.modelLabel')} htmlFor="equipment-model">
                    <Input id="equipment-model" value={form.model} onChange={(e) => set('model', e.target.value.slice(0, TEXT_MAX))} maxLength={TEXT_MAX} className={INPUT_CLASS} disabled={saving} />
                  </Field>
                  <Field
                    label={t('provider.equipment.yearLabel')}
                    htmlFor="equipment-year"
                    hint={yearValid ? undefined : t('provider.equipment.yearInvalid', { min: YEAR_MIN })}
                  >
                    <Input id="equipment-year" type="number" inputMode="numeric" value={form.year} onChange={(e) => set('year', e.target.value)} className={INPUT_CLASS} disabled={saving} />
                  </Field>

                  {definitions.map((definition) => {
                    const fieldLabel = catalogueLabel('attribute', definition.code, definition.label_en);
                    const id = `equipment-attr-${definition.code}`;
                    if (definition.type === 'boolean') {
                      return (
                        <SwitchRow
                          key={definition.code}
                          id={id}
                          label={fieldLabel}
                          checked={form.attributes[definition.code] === true}
                          onCheckedChange={(checked) => set('attributes', { ...form.attributes, [definition.code]: checked })}
                          disabled={saving}
                        />
                      );
                    }
                    return (
                      <Field key={definition.code} label={definition.unit ? `${fieldLabel} (${definition.unit})` : fieldLabel} htmlFor={id}>
                        <Input
                          id={id}
                          type={definition.type === 'number' ? 'number' : 'text'}
                          inputMode={definition.type === 'number' ? 'decimal' : undefined}
                          step={definition.type === 'number' ? 'any' : undefined}
                          value={typeof form.attributes[definition.code] === 'string' ? (form.attributes[definition.code] as string) : ''}
                          onChange={(e) => set('attributes', { ...form.attributes, [definition.code]: e.target.value })}
                          maxLength={definition.type === 'number' ? undefined : TEXT_MAX}
                          className={INPUT_CLASS}
                          disabled={saving}
                        />
                      </Field>
                    );
                  })}

                  <Field label={t('provider.equipment.ownershipLabel')} htmlFor="equipment-ownership">
                    <NativeSelect
                      id="equipment-ownership"
                      value={form.ownership}
                      onChange={(value) => set('ownership', value)}
                      options={OWNERSHIPS.map((code) => ({ value: code, label: t(`provider.equipment.ownership.${code}`) }))}
                      disabled={saving}
                    />
                  </Field>
                  <Field label={t('provider.equipment.conditionLabel')} htmlFor="equipment-condition">
                    <NativeSelect
                      id="equipment-condition"
                      value={form.condition}
                      onChange={(value) => set('condition', value)}
                      options={CONDITIONS.map((code) => ({ value: code, label: t(`provider.equipment.condition.${code}`) }))}
                      placeholder={t('provider.common.notSet')}
                      disabled={saving}
                    />
                  </Field>
                  <Field label={t('provider.equipment.registrationLabel')} htmlFor="equipment-registration" hint={t('provider.equipment.registrationHint')}>
                    <Input id="equipment-registration" value={form.registration} onChange={(e) => set('registration', e.target.value.slice(0, 20))} maxLength={20} autoCapitalize="characters" className={INPUT_CLASS} disabled={saving} />
                  </Field>

                  <Button type="submit" disabled={!canSave} className="w-full h-12 text-base">
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
                    {t('provider.common.save')}
                  </Button>
                </form>
              )}
            </SheetContent>
          </Sheet>
        </>
      )}
    </ProviderPage>
  );
}
