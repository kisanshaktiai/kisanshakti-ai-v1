import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, Sparkles, X, Sprout, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCropVarieties, type CropVariety } from '@/hooks/useCropVarieties';
import VarietyDetailCard from '@/components/crops/VarietyDetailCard';
import VarietySubmitDialog from '@/components/crops/VarietySubmitDialog';
import { useTranslation } from 'react-i18next';

export type VarietyOption = CropVariety;

interface VarietySelectorProps {
  /** The crop id (public.crops.id) to filter varieties by. Required. */
  cropId: string | null | undefined;
  /** Currently selected variety id, if any. */
  value?: string | null;
  /** Called when the user picks (or clears) a variety from the catalogue. */
  onChange: (variety: VarietyOption | null) => void;
  /** Called when farmer submits a brand-new (un-catalogued) variety name. */
  onManualSubmit?: (proposedName: string) => void;
  /** Optional label override. */
  label?: string;
  /** Display name of the crop (used in submit dialog). */
  cropName?: string;
  /** Compact (smaller) layout for embedding in narrow dialogs. */
  compact?: boolean;
}

/**
 * VarietySelector — farmer-facing dropdown that lists every seed variety stored
 * as a master_product (product_type='seed') for the given crop. Selected variety
 * renders a rich detail card with maturity, water, suitable regions, and
 * resistance profile. If the farmer's variety isn't listed, they can submit it
 * for tenant review via variety_submissions.
 *
 * Honours project invariant: 100% of agronomic data comes from the DB.
 */
export function VarietySelector({
  cropId,
  value,
  onChange,
  onManualSubmit,
  label,
  cropName,
  compact = false,
}: VarietySelectorProps) {
  const { t } = useTranslation();
  const { varieties, loading } = useCropVarieties(cropId);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const selected = useMemo(
    () => varieties.find((v) => v.id === value) ?? null,
    [varieties, value]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return varieties;
    const q = search.toLowerCase();
    return varieties.filter((v) =>
      [v.name, v.variety_code, v.brand, v.label_hi, v.label_mr, v.released_by]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  }, [varieties, search]);

  const resolvedLabel = label ?? t('schedule.variety.label', 'Seed variety');

  if (!cropId) {
    return (
      <div className="text-xs text-muted-foreground italic">
        {t('schedule.variety.choose_crop_first', 'Select a crop first to see its varieties.')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <Sprout className="h-3.5 w-3.5 text-primary" />
          {resolvedLabel}
        </label>
        {selected && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => { onChange(null); setOpen(false); }}
          >
            <X className="h-3 w-3 mr-1" /> {t('common.clear', 'Clear')}
          </Button>
        )}
      </div>

      {/* Selected detail card */}
      {selected ? (
        <div className="space-y-2">
          <VarietyDetailCard variety={selected} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => setOpen((o) => !o)}
          >
            {t('schedule.variety.change', 'Change variety')}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start text-sm font-normal h-11"
          onClick={() => setOpen((o) => !o)}
        >
          <Search className="h-4 w-4 mr-2 text-muted-foreground" />
          {loading
            ? t('schedule.variety.loading', 'Loading varieties…')
            : varieties.length === 0
              ? t('schedule.variety.none_for_crop', 'No varieties catalogued — add yours')
              : t('schedule.variety.choose_from', { count: varieties.length, defaultValue: `Choose from {{count}} varieties` })}
        </Button>
      )}

      {/* Picker */}
      {open && (
        <Card>
          <CardContent className="p-2 space-y-2">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('schedule.variety.search_placeholder', 'Search by name, code, brand…')}
              className="h-9 text-sm"
            />
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {t('schedule.variety.no_match', 'No varieties match your search.')}
              </p>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-1.5 pr-2">
                  {filtered.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        onChange(v);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={cn(
                        'w-full text-left rounded-md border p-2.5 transition-colors',
                        'hover:border-primary hover:bg-primary/5',
                        value === v.id && 'border-primary bg-primary/10'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm">{v.name}</span>
                            {v.is_featured && (
                              <Sparkles className="h-3 w-3 text-primary" />
                            )}
                          </div>
                          {v.brand && (
                            <p className="text-[11px] text-muted-foreground truncate">{v.brand}</p>
                          )}
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {v.maturity_days_min && v.maturity_days_max && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                {v.maturity_days_min}–{v.maturity_days_max}d
                              </Badge>
                            )}
                            {v.yield_potential_qtl_per_acre != null && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                ~{v.yield_potential_qtl_per_acre} q/ac
                              </Badge>
                            )}
                            {v.season && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 capitalize">
                                {v.season}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Always-on CTA to submit a missing variety */}
            <Button
              type="button"
              variant="ghost"
              className="w-full h-8 text-xs text-primary hover:text-primary"
              onClick={() => { setOpen(false); setSubmitOpen(true); }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('schedule.variety.add_missing', "My variety isn't listed — add it")}
            </Button>
          </CardContent>
        </Card>
      )}

      <VarietySubmitDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        cropId={cropId}
        cropName={cropName}
        onSubmitted={(proposed) => {
          onChange(null); // no catalogued variety yet
          onManualSubmit?.(proposed);
        }}
      />
    </div>
  );
}

export default VarietySelector;
