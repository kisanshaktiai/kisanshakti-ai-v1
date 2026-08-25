import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Sparkles, X, Sprout, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCropVarieties, type CropVariety } from '@/hooks/useCropVarieties';
import VarietyDetailSheet from '@/components/crops/VarietyDetailSheet';
import VarietySubmitDialog from '@/components/crops/VarietySubmitDialog';
import { useTranslation } from 'react-i18next';

export type VarietyOption = CropVariety;

interface VarietySelectorProps {
  cropId: string | null | undefined;
  value?: string | null;
  onChange: (variety: VarietyOption | null) => void;
  onManualSubmit?: (proposedName: string) => void;
  label?: string;
  cropName?: string;
}

/**
 * 2030-ready mobile-first variety picker.
 * - Renders a dense grid of compact name-only chips (max screen real estate).
 * - Tap a chip → opens a full-height detail Sheet sourcing rich content from
 *   `variety_translations.detailed_description` for the active language.
 * - Falls back gracefully when content is missing ("Currently information not
 *   available. We'll update soon.").
 * - Honours invariant: all agronomic content from the DB; LLM never authors it.
 */
export function VarietySelector({
  cropId,
  value,
  onChange,
  onManualSubmit,
  label,
  cropName,
}: VarietySelectorProps) {
  const { t, i18n } = useTranslation();
  const { varieties, loading } = useCropVarieties(cropId);
  const [search, setSearch] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);

  const lang = (i18n.language || 'en').split('-')[0];

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

  const previewVariety = useMemo(
    () => varieties.find((v) => v.id === previewId) ?? null,
    [varieties, previewId]
  );

  const resolvedLabel = label ?? t('schedule.variety.label', 'Seed variety');

  if (!cropId) {
    return (
      <div className="text-xs text-muted-foreground italic">
        {t('schedule.variety.choose_crop_first', 'Select a crop first to see its varieties.')}
      </div>
    );
  }

  const chipName = (v: CropVariety) => {
    if (lang === 'hi' && v.label_hi) return v.label_hi;
    if (lang === 'mr' && v.label_mr) return v.label_mr;
    return v.name;
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Sprout className="h-3.5 w-3.5 text-primary" />
          {resolvedLabel}
          {selected && (
            <span className="text-[10px] font-normal text-foreground/70">
              · {chipName(selected)}
            </span>
          )}
        </label>
        {selected && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => onChange(null)}
          >
            <X className="h-3 w-3 mr-1" /> {t('common.clear', 'Clear')}
          </Button>
        )}
      </div>

      {/* Search */}
      {varieties.length > 4 && (
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('schedule.variety.search_placeholder', 'Search by name, code or brand…')}
            className="h-9 pl-8 text-sm"
          />
        </div>
      )}

      {/* Helper hint */}
      {!loading && filtered.length > 0 && (
        <p className="text-[10px] text-muted-foreground/80 italic">
          {t('schedule.variety.tap_to_view', 'Tap any variety to see full details')}
        </p>
      )}

      {/* Grid of tappable variety cards — mobile-first, big touch targets */}
      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          {varieties.length === 0
            ? t('schedule.variety.none_for_crop', 'No varieties catalogued yet — add yours')
            : t('schedule.variety.no_match', 'No varieties match your search.')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map((v) => {
            const isSelected = v.id === value;
            const localName = chipName(v);
            const showEnglishSubtitle = localName !== v.name;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setPreviewId(v.id)}
                className={cn(
                  'group relative text-left rounded-2xl border bg-card px-3.5 py-3 transition-all active:scale-[0.97] min-h-[84px]',
                  'hover:border-primary/60 hover:shadow-sm hover:bg-primary/5',
                  isSelected
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/50 shadow-sm'
                    : 'border-border/60'
                )}
              >
                {v.is_featured && !isSelected && (
                  <span className="absolute -top-1.5 -right-1 flex items-center gap-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 shadow">
                    <Sparkles className="h-2 w-2" />
                    {t('schedule.variety.featured', 'Recommended')}
                  </span>
                )}
                {isSelected && (
                  <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight line-clamp-2 break-words text-foreground">
                      {localName}
                    </span>
                    {showEnglishSubtitle && (
                      <span className="block text-[10px] text-muted-foreground leading-tight truncate mt-0.5">
                        {v.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1 mt-2">
                  {(v.maturity_days_min || v.maturity_days_max) && (
                    <Badge
                      variant="outline"
                      className="h-5 text-[10px] px-1.5 border-border/50 text-muted-foreground"
                    >
                      {v.maturity_days_min ?? '?'}–{v.maturity_days_max ?? '?'}{t('schedule.variety.days', 'days').charAt(0)}
                    </Badge>
                  )}
                  {v.yield_potential_qtl_per_acre != null && (
                    <Badge
                      variant="outline"
                      className="h-5 text-[10px] px-1.5 border-border/50 text-muted-foreground"
                    >
                      ~{v.yield_potential_qtl_per_acre}q
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Add missing CTA */}
      <Button
        type="button"
        variant="ghost"
        className="w-full h-8 text-xs text-primary hover:text-primary"
        onClick={() => setSubmitOpen(true)}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        {t('schedule.variety.add_missing', "My variety isn't listed — add it")}
      </Button>

      {/* Detail Sheet */}
      <VarietyDetailSheet
        variety={previewVariety}
        open={!!previewVariety}
        onOpenChange={(o) => !o && setPreviewId(null)}
        selected={!!previewVariety && previewVariety.id === value}
        onSelect={(v) => onChange(v)}
      />

      <VarietySubmitDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        cropId={cropId}
        cropName={cropName}
        onSubmitted={(proposed) => {
          onChange(null);
          onManualSubmit?.(proposed);
        }}
      />
    </div>
  );
}

export default VarietySelector;
