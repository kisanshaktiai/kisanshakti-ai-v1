import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, MapPin, Building2, Map, Home, Search, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUnifiedLocation } from '@/hooks/useUnifiedLocation';
import { FieldChip } from './FieldChip';

export interface LocationValue {
  country: string;          country_code: string;
  state?: string;           state_id?: string;
  district?: string;        district_id?: string;
  taluka?: string;          taluka_id?: string;
  village?: string;         village_id?: string;
}

interface Props {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  /** Confidence map keyed by field name (country/state/district/taluka/village) */
  confidence?: Record<string, number>;
  /** Source map keyed the same way ('google_reverse_geocode' / 'farmer' / etc.) */
  sources?: Record<string, string>;
  /** Mark which manual edits should flip confidence to 1.0 + source='farmer' */
  onManualEdit?: (field: keyof LocationValue) => void;
  /** Show the Country chip. Default false — country defaults to India and is hidden. */
  showCountry?: boolean;
  /** Hide the section heading (when embedded inside a ReviewCard) */
  hideHeading?: boolean;
}

type PickerKind = 'country' | 'state' | 'district' | 'taluka' | 'village' | null;

const COUNTRIES = [
  { code: 'IN', name: 'India' },
];

export function LocationPickerSection({
  value, onChange, confidence = {}, sources = {}, onManualEdit,
  showCountry = false, hideHeading = false,
}: Props) {
  const { t } = useTranslation();
  const {
    states, districts, talukas, villages,
    loadDistricts, loadTalukas, loadVillages,
    loading,
  } = useUnifiedLocation();

  const [picker, setPicker] = useState<PickerKind>(null);
  const [search, setSearch] = useState('');
  const [villageFreeText, setVillageFreeText] = useState('');
  // Block taps for ~350ms after the sheet opens so the chip's mouseup
  // doesn't "click through" onto the first item rendered under the cursor.
  const [tapsArmed, setTapsArmed] = useState(false);

  // Pre-load cascading data so the picker is instant when opened.
  useEffect(() => { if (value.state_id) loadDistricts(value.state_id); }, [value.state_id, loadDistricts]);
  useEffect(() => { if (value.district_id) loadTalukas(value.district_id); }, [value.district_id, loadTalukas]);
  useEffect(() => { if (value.taluka_id) loadVillages(value.taluka_id); }, [value.taluka_id, loadVillages]);

  // Reset search when picker changes; arm taps after the open animation.
  // Also kick off a load for the current level if its parent is known but data is empty.
  useEffect(() => {
    setSearch('');
    setVillageFreeText('');
    if (picker === null) {
      setTapsArmed(false);
      return;
    }
    if (picker === 'district' && value.state_id && districts.length === 0) loadDistricts(value.state_id);
    if (picker === 'taluka'   && value.district_id && talukas.length === 0) loadTalukas(value.district_id);
    if (picker === 'village'  && value.taluka_id && villages.length === 0) loadVillages(value.taluka_id);
    setTapsArmed(false);
    const id = window.setTimeout(() => setTapsArmed(true), 350);
    return () => window.clearTimeout(id);
  }, [picker]);

  const items = useMemo(() => {
    const filter = (arr: any[], key = 'name') =>
      !search ? arr : arr.filter(i => i[key]?.toLowerCase().includes(search.toLowerCase()));
    switch (picker) {
      case 'country':  return COUNTRIES.map(c => ({ id: c.code, name: c.name, code: c.code }));
      case 'state':    return filter(states);
      case 'district': return filter(districts);
      case 'taluka':   return filter(talukas);
      case 'village':  return filter(villages);
      default:         return [];
    }
  }, [picker, search, states, districts, talukas, villages]);

  const apply = (item: any) => {
    const next: LocationValue = { ...value };
    switch (picker) {
      case 'country':
        next.country = item.name; next.country_code = item.code;
        onManualEdit?.('country');
        break;
      case 'state':
        if (next.state_id !== item.id) {
          next.district = undefined; next.district_id = undefined;
          next.taluka = undefined;   next.taluka_id = undefined;
          next.village = undefined;  next.village_id = undefined;
        }
        next.state = item.name; next.state_id = item.id;
        onManualEdit?.('state');
        loadDistricts(item.id);
        break;
      case 'district':
        if (next.district_id !== item.id) {
          next.taluka = undefined;  next.taluka_id = undefined;
          next.village = undefined; next.village_id = undefined;
        }
        next.district = item.name; next.district_id = item.id;
        onManualEdit?.('district');
        loadTalukas(item.id);
        break;
      case 'taluka':
        if (next.taluka_id !== item.id) {
          next.village = undefined; next.village_id = undefined;
        }
        next.taluka = item.name; next.taluka_id = item.id;
        onManualEdit?.('taluka');
        loadVillages(item.id);
        break;
      case 'village':
        next.village = item.name; next.village_id = item.id;
        onManualEdit?.('village');
        break;
    }
    onChange(next);
    setPicker(null);
  };

  const applyVillageFreeText = () => {
    const name = villageFreeText.trim();
    if (!name) return;
    const next: LocationValue = { ...value };
    switch (picker) {
      case 'district':
        next.district = name; next.district_id = undefined;
        next.taluka = undefined; next.taluka_id = undefined;
        next.village = undefined; next.village_id = undefined;
        onManualEdit?.('district');
        break;
      case 'taluka':
        next.taluka = name; next.taluka_id = undefined;
        next.village = undefined; next.village_id = undefined;
        onManualEdit?.('taluka');
        break;
      case 'village':
      default:
        next.village = name; next.village_id = undefined;
        onManualEdit?.('village');
        break;
    }
    onChange(next);
    setPicker(null);
  };

  const openPicker = (kind: Exclude<PickerKind, null>) => {
    // Try to back-fill missing parent ids from already-loaded lists by name match.
    // This unblocks the cascade when AI prefilled names but couldn't resolve canonical ids.
    let nextValue = value;
    if (kind === 'district' && !value.state_id && value.state) {
      const match = states.find(s => s.name.toLowerCase() === value.state!.toLowerCase());
      if (match) { nextValue = { ...nextValue, state_id: match.id }; onChange(nextValue); }
    }
    if (kind === 'taluka' && !value.district_id && value.district) {
      const match = districts.find(d => d.name.toLowerCase() === value.district!.toLowerCase());
      if (match) { nextValue = { ...nextValue, district_id: match.id }; onChange(nextValue); }
    }
    if (kind === 'village' && !value.taluka_id && value.taluka) {
      const match = talukas.find(tk => tk.name.toLowerCase() === value.taluka!.toLowerCase());
      if (match) { nextValue = { ...nextValue, taluka_id: match.id }; onChange(nextValue); }
    }
    // ALWAYS trigger a fresh load for the level being opened — covers the case
    // where parent_id is set but child arrays are stale/empty (e.g. user reopened sheet).
    if (kind === 'district' && nextValue.state_id) loadDistricts(nextValue.state_id);
    if (kind === 'taluka'   && nextValue.district_id) loadTalukas(nextValue.district_id);
    if (kind === 'village'  && nextValue.taluka_id) loadVillages(nextValue.taluka_id);
    // Always open the sheet — even if parent id is still missing, user gets clear guidance inside.
    setPicker(kind);
  };

  const hint = (kind: PickerKind): string | undefined => {
    if (kind === 'district' && !value.state_id) return t('lands.location.selectStateFirst', { defaultValue: 'Select State first' });
    if (kind === 'taluka'   && !value.district_id) return t('lands.location.selectDistrictFirst', { defaultValue: 'Select District first' });
    if (kind === 'village'  && !value.taluka_id) return t('lands.location.selectTalukaFirst', { defaultValue: 'Select Taluka first' });
    return undefined;
  };

  // Within-sheet guard: when the user opens District/Taluka/Village without a resolvable parent.
  const missingParent: Exclude<PickerKind, 'country' | 'state' | null> | null =
    picker === 'district' && !value.state_id ? 'district'
    : picker === 'taluka' && !value.district_id ? 'taluka'
    : picker === 'village' && !value.taluka_id ? 'village'
    : null;

  const parentLevel = (kind: typeof missingParent): Exclude<PickerKind, null> =>
    kind === 'district' ? 'state' : kind === 'taluka' ? 'district' : 'taluka';

  return (
    <div>
      {!hideHeading && (
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          {t('lands.location.title', { defaultValue: 'Location' })} *
        </h3>
      )}
      <div className="space-y-2">
        {showCountry && (
          <FieldChip
            icon={<Globe className="h-5 w-5" />}
            label={t('lands.location.country', { defaultValue: 'Country' })}
            value={value.country}
            confidence={confidence.country}
            source={sources.country}
            onClick={() => openPicker('country')}
            required
          />
        )}
        <FieldChip
          icon={<MapPin className="h-5 w-5" />}
          label={t('lands.location.state', { defaultValue: 'State' })}
          value={value.state}
          confidence={confidence.state}
          source={sources.state}
          onClick={() => openPicker('state')}
          required
        />
        <FieldChip
          icon={<Building2 className="h-5 w-5" />}
          label={t('lands.location.district', { defaultValue: 'District' })}
          value={value.district}
          confidence={confidence.district}
          source={sources.district}
          onClick={() => openPicker('district')}
          placeholder={hint('district')}
          required
        />
        <FieldChip
          icon={<Map className="h-5 w-5" />}
          label={t('lands.location.taluka', { defaultValue: 'Taluka / Tehsil' })}
          value={value.taluka}
          confidence={confidence.taluka}
          source={sources.taluka}
          onClick={() => openPicker('taluka')}
          placeholder={hint('taluka')}
        />
        <FieldChip
          icon={<Home className="h-5 w-5" />}
          label={t('lands.location.village', { defaultValue: 'Village' })}
          value={value.village}
          confidence={confidence.village}
          source={sources.village}
          onClick={() => openPicker('village')}
          placeholder={hint('village')}
        />
      </div>

      <Sheet open={picker !== null} onOpenChange={(o) => !o && setPicker(null)}>
        <SheetContent side="bottom" className="z-[70] rounded-t-3xl max-h-[85vh] overflow-y-auto p-0">
          {/* Sticky header + search */}
          <div className="sticky top-0 z-10 bg-background border-b border-border px-4 pt-4 pb-3 space-y-3">
            <SheetHeader className="text-left">
              <SheetTitle className="text-base">
                {picker === 'country'  && t('lands.location.country',  { defaultValue: 'Select country' })}
                {picker === 'state'    && t('lands.location.state',    { defaultValue: 'Select state' })}
                {picker === 'district' && t('lands.location.district', { defaultValue: 'Select district' })}
                {picker === 'taluka'   && t('lands.location.taluka',   { defaultValue: 'Select taluka / tehsil' })}
                {picker === 'village'  && t('lands.location.village',  { defaultValue: 'Select village' })}
              </SheetTitle>
            </SheetHeader>

            {picker && picker !== 'country' && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    // Mirror search into village free-text so "Use" button is enabled
                    if (picker === 'village' || picker === 'district' || picker === 'taluka') {
                      setVillageFreeText(e.target.value);
                    }
                  }}
                  placeholder={t('lands.location.searchPlaceholder', { defaultValue: 'Type to search…' })}
                  className="h-12 pl-10 rounded-xl text-base"
                  autoFocus
                />
              </div>
            )}
          </div>

          <div className="px-4 pb-6">
            {/* Missing-parent banner — instead of silently doing nothing, point the farmer at the right level. */}
            {missingParent && (
              <div className="mt-3 rounded-2xl border border-warning/50/60 bg-warning-soft dark:bg-warning/20 p-3 flex items-start gap-3">
                <div className="flex-1 text-xs text-warning dark:text-warning">
                  {missingParent === 'district' && t('lands.location.selectStateFirst', { defaultValue: 'Select State first to see districts.' })}
                  {missingParent === 'taluka'   && t('lands.location.selectDistrictFirst', { defaultValue: 'Select District first to see talukas.' })}
                  {missingParent === 'village'  && t('lands.location.selectTalukaFirst', { defaultValue: 'Select Taluka first to see villages.' })}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-xl shrink-0"
                  onClick={() => setPicker(parentLevel(missingParent))}
                >
                  {missingParent === 'district' && t('lands.location.pickState', { defaultValue: 'Pick State' })}
                  {missingParent === 'taluka'   && t('lands.location.pickDistrict', { defaultValue: 'Pick District' })}
                  {missingParent === 'village'  && t('lands.location.pickTaluka', { defaultValue: 'Pick Taluka' })}
                </Button>
              </div>
            )}

            {/* Free-text fallback (works for district / taluka / village — sparse rows in DB) */}
            {!missingParent && (picker === 'village' || picker === 'district' || picker === 'taluka') && (
              <div className="mt-3 rounded-2xl border border-dashed border-border bg-muted/40 p-3 space-y-2">
                <div className="text-xs text-muted-foreground">
                  {picker === 'village' && t('lands.location.villageNotListed', { defaultValue: 'Not in the list? Type your village name and tap Use.' })}
                  {picker === 'district' && t('lands.location.districtNotListed', { defaultValue: 'Wrong district? Type the correct one and tap Use.' })}
                  {picker === 'taluka' && t('lands.location.talukaNotListed', { defaultValue: 'Wrong taluka? Type the correct one and tap Use.' })}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={villageFreeText}
                    onChange={(e) => setVillageFreeText(e.target.value)}
                    placeholder={
                      picker === 'village'
                        ? t('lands.location.villageTypeName', { defaultValue: 'Type village name' })
                        : picker === 'district'
                          ? t('lands.location.districtTypeName', { defaultValue: 'Type district name' })
                          : t('lands.location.talukaTypeName', { defaultValue: 'Type taluka name' })
                    }
                    className="h-11 rounded-xl"
                  />
                  <Button
                    type="button"
                    onClick={applyVillageFreeText}
                    disabled={!villageFreeText.trim()}
                    className="h-11 rounded-xl shrink-0"
                  >
                    {t('common.use', { defaultValue: 'Use' })}
                  </Button>
                </div>
              </div>
            )}

            {!missingParent && (
              <div
                className={cn(
                  'grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 transition-opacity',
                  !tapsArmed && 'pointer-events-none opacity-60',
                )}
              >
                {items.map((it: any) => (
                  <button
                    key={it.id || it.code}
                    type="button"
                    onClick={() => { if (tapsArmed) apply(it); }}
                    className={cn(
                      'rounded-2xl border bg-card px-4 py-3 text-sm text-left active:scale-[0.97]',
                      'border-border hover:border-primary/40 min-h-[52px]',
                    )}
                  >
                    <div className="font-medium truncate">{it.name}</div>
                  </button>
                ))}
              </div>
            )}

            {!missingParent && items.length === 0 && (
              <div className="col-span-full text-center py-8 px-3">
                {(() => {
                  // Show loader when the relevant array is empty and either the
                  // hook is loading OR the parent id is set (data is on its way).
                  const isLoadingNow =
                    (picker === 'state'    && (loading.states    || states.length === 0)) ||
                    (picker === 'district' && (loading.districts || (value.state_id && districts.length === 0))) ||
                    (picker === 'taluka'   && (loading.talukas   || (value.district_id && talukas.length === 0))) ||
                    (picker === 'village'  && (loading.villages  || (value.taluka_id && villages.length === 0)));
                  if (isLoadingNow && !search) {
                    return (
                      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        {t('common.loading', { defaultValue: 'Loading…' })}
                      </div>
                    );
                  }
                  return (
                    <>
                      <div className="text-sm font-medium">
                        {search
                          ? t('lands.location.noMatchesFor', { defaultValue: 'No matches for "{{q}}"', q: search })
                          : t('common.noResults', { defaultValue: 'No matches' })}
                      </div>
                      {picker === 'state' ? (
                        <div className="text-xs text-muted-foreground mt-2">
                          {t('lands.location.stateMustPick', { defaultValue: 'Try clearing the search — all 36 states are available.' })}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground mt-2">
                          {t('lands.location.useTypedAbove', { defaultValue: 'Use the box above to enter it manually.' })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
