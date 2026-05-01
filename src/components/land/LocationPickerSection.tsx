import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, MapPin, Building2, Map, Home, Search } from 'lucide-react';
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
  useEffect(() => {
    setSearch('');
    setVillageFreeText('');
    if (picker === null) {
      setTapsArmed(false);
      return;
    }
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
    if (kind === 'district' && !value.state_id) return;
    if (kind === 'taluka'   && !value.district_id) return;
    if (kind === 'village'  && !value.taluka_id) return;
    setPicker(kind);
  };

  const hint = (kind: PickerKind): string | undefined => {
    if (kind === 'district' && !value.state_id) return t('lands.location.selectStateFirst', { defaultValue: 'Select State first' });
    if (kind === 'taluka'   && !value.district_id) return t('lands.location.selectDistrictFirst', { defaultValue: 'Select District first' });
    if (kind === 'village'  && !value.taluka_id) return t('lands.location.selectTalukaFirst', { defaultValue: 'Select Taluka first' });
    return undefined;
  };

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
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {picker === 'country'  && t('lands.location.country',  { defaultValue: 'Country' })}
              {picker === 'state'    && t('lands.location.state',    { defaultValue: 'State' })}
              {picker === 'district' && t('lands.location.district', { defaultValue: 'District' })}
              {picker === 'taluka'   && t('lands.location.taluka',   { defaultValue: 'Taluka / Tehsil' })}
              {picker === 'village'  && t('lands.location.village',  { defaultValue: 'Village' })}
            </SheetTitle>
          </SheetHeader>

          {/* Search box (skip for country) */}
          {picker && picker !== 'country' && (
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common.search', { defaultValue: 'Search…' })}
                className="h-11 pl-9 rounded-xl"
                autoFocus
              />
            </div>
          )}

          {/* Village free-text fallback (villages table is sparse) */}
          {picker === 'village' && (
            <div className="mt-3 rounded-2xl border border-dashed border-border bg-muted/40 p-3 space-y-2">
              <div className="text-xs text-muted-foreground">
                {t('lands.location.villageNotListed', {
                  defaultValue: 'Village not in the list? Type it below.',
                })}
              </div>
              <div className="flex gap-2">
                <Input
                  value={villageFreeText}
                  onChange={(e) => setVillageFreeText(e.target.value)}
                  placeholder={t('lands.location.villageTypeName', { defaultValue: 'Type village name' })}
                  className="h-11 rounded-xl"
                />
                <Button
                  type="button"
                  onClick={applyVillageFreeText}
                  disabled={!villageFreeText.trim()}
                  className="h-11 rounded-xl"
                >
                  {t('common.use', { defaultValue: 'Use' })}
                </Button>
              </div>
            </div>
          )}

          <div
            className={cn(
              'grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pb-4 transition-opacity',
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
            {items.length === 0 && (
              <div className="col-span-full text-center text-sm text-muted-foreground py-8">
                {(picker === 'state'    && loading.states) ||
                 (picker === 'district' && loading.districts) ||
                 (picker === 'taluka'   && loading.talukas) ||
                 (picker === 'village'  && loading.villages)
                  ? t('common.loading', { defaultValue: 'Loading…' })
                  : t('common.noResults', { defaultValue: 'No matches' })}
              </div>
            )}
          </div>

        </SheetContent>
      </Sheet>
    </div>
  );
}
