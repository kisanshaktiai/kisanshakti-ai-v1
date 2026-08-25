import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Droplets, Calendar, MapPin, Shield, Sprout, Award, TrendingUp, BookOpen, Check, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  useVarietyResistance,
  useVarietyTranslation,
  type CropVariety,
} from '@/hooks/useCropVarieties';

interface VarietyDetailSheetProps {
  variety: CropVariety | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected?: boolean;
  onSelect?: (v: CropVariety) => void;
}

const levelStyle = (level: string) => {
  const l = (level || '').toUpperCase();
  if (l === 'R' || l === 'HR' || l === 'RESISTANT' || l === 'HIGHLY_RESISTANT')
    return 'bg-success/10 text-success border-success/30';
  if (l === 'MR' || l === 'MODERATELY_RESISTANT')
    return 'bg-warning/10 text-warning border-warning/30';
  if (l === 'S' || l === 'MS' || l === 'SUSCEPTIBLE')
    return 'bg-destructive/10 text-destructive border-destructive/30';
  return 'bg-muted text-muted-foreground border-border';
};

const Metric: React.FC<{
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}> = ({ icon: Icon, label, value }) => (
  <div className="rounded-2xl bg-card border border-border/60 p-3">
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <div className="text-sm font-semibold mt-1 leading-tight">{value ?? '—'}</div>
  </div>
);

export const VarietyDetailSheet: React.FC<VarietyDetailSheetProps> = ({
  variety,
  open,
  onOpenChange,
  selected,
  onSelect,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || 'en').split('-')[0];
  const { rows: resistance, loading: resLoading } = useVarietyResistance(variety?.id);
  const { translation, loading: trLoading } = useVarietyTranslation(variety?.id, lang);

  if (!variety) return null;

  const localName = translation?.display_name
    || (lang === 'hi' ? variety.label_hi : lang === 'mr' ? variety.label_mr : null);

  const description =
    translation?.detailed_description?.trim()
    || translation?.short_description?.trim()
    || variety.description?.trim()
    || null;

  const irrigation: string | null =
    variety.agro_ecological_suitability?.irrigation_regime
    || variety.agro_ecological_suitability?.water_requirement
    || null;

  const states = Array.isArray(variety.state_suitability) ? variety.state_suitability : [];
  const synonyms = Array.isArray(translation?.local_synonyms) ? translation!.local_synonyms! : [];

  const maturityText =
    variety.maturity_days_min && variety.maturity_days_max
      ? `${variety.maturity_days_min}–${variety.maturity_days_max} ${t('schedule.variety.days', 'days')}`
      : variety.maturity_days_max
        ? `~${variety.maturity_days_max} ${t('schedule.variety.days', 'days')}`
        : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92vh] p-0 rounded-t-3xl bg-background flex flex-col"
      >
        {/* Drag handle */}
        <div className="pt-2 pb-1 flex justify-center shrink-0">
          <div className="h-1.5 w-12 rounded-full bg-muted" />
        </div>

        <SheetHeader className="px-4 pt-2 pb-3 shrink-0 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base leading-tight flex items-center gap-2 flex-wrap">
                <span className="truncate">{variety.name}</span>
                {variety.variety_code && (
                  <Badge variant="outline" className="h-5 text-[10px] px-1.5">
                    {variety.variety_code}
                  </Badge>
                )}
                {variety.variety_completeness_score != null && (
                  <Badge variant="secondary" className="h-5 text-[10px] flex items-center gap-0.5">
                    <Award className="h-2.5 w-2.5" />
                    {Math.round(Number(variety.variety_completeness_score))}%
                  </Badge>
                )}
              </SheetTitle>
              {localName && (
                <p className="text-sm text-muted-foreground mt-0.5">{localName}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
                {variety.brand && <span>{variety.brand}</span>}
                {variety.released_by && (
                  <span>· {t('schedule.variety.released_by', 'Released by')} {variety.released_by}</span>
                )}
                {variety.season && <span>· <span className="capitalize">{variety.season}</span></span>}
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 pb-28">
          <div className="space-y-4">
            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-2">
              <Metric icon={Calendar} label={t('schedule.variety.maturity', 'Maturity')} value={maturityText} />
              <Metric
                icon={TrendingUp}
                label={t('schedule.variety.yield', 'Yield')}
                value={variety.yield_potential_qtl_per_acre != null ? `~${variety.yield_potential_qtl_per_acre} q/ac` : null}
              />
              <Metric
                icon={Droplets}
                label={t('schedule.variety.irrigation', 'Water')}
                value={irrigation ? <span className="capitalize">{String(irrigation).replace(/_/g, ' ')}</span> : null}
              />
              <Metric
                icon={Sprout}
                label={t('schedule.variety.seed_rate', 'Seed rate')}
                value={variety.seed_rate_kg_per_acre != null ? `${variety.seed_rate_kg_per_acre} kg/ac` : null}
              />
            </div>

            {/* About / detailed description */}
            <section className="rounded-2xl bg-card border border-border/60 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                {t('schedule.variety.about', 'About this variety')}
              </div>
              {trLoading ? (
                <p className="text-xs text-muted-foreground italic">
                  {t('schedule.variety.loading_details', 'Loading…')}
                </p>
              ) : description ? (
                <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
                  {description}
                </p>
              ) : (
                <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2">
                  <Info className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground italic">
                    {t(
                      'schedule.variety.no_details',
                      "Currently information not available. We'll update soon."
                    )}
                  </p>
                </div>
              )}
              {synonyms.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {synonyms.map((s, i) => (
                    <Badge key={`${s}-${i}`} variant="outline" className="h-5 text-[10px] px-1.5">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
            </section>

            {/* Suitable regions */}
            {states.length > 0 && (
              <section className="rounded-2xl bg-card border border-border/60 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  {t('schedule.variety.suitable_states', 'Suitable for')}
                </div>
                <div className="flex flex-wrap gap-1">
                  {states.map((s) => (
                    <Badge key={s} variant="outline" className="h-5 text-[10px] px-1.5">
                      {s}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {/* Resistance */}
            <section className="rounded-2xl bg-card border border-border/60 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Shield className="h-3.5 w-3.5 text-primary" />
                {t('schedule.variety.resistance', 'Pest & disease resistance')}
              </div>
              {resLoading ? (
                <p className="text-[11px] text-muted-foreground italic">
                  {t('schedule.variety.loading_resistance', 'Loading…')}
                </p>
              ) : resistance.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  {t('schedule.variety.no_resistance', 'No catalogued resistance data.')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {resistance.map((r, i) => (
                    <Badge
                      key={`${r.pathogen}-${i}`}
                      variant="outline"
                      className={cn('h-6 text-[11px] px-2 gap-1 capitalize', levelStyle(r.level))}
                      title={r.notes || undefined}
                    >
                      <span className="font-medium">
                        {r.pathogen.replace(/_/g, ' ').toLowerCase()}
                      </span>
                      <span className="opacity-80">· {r.level.toUpperCase()}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>

        {/* Sticky select CTA */}
        {onSelect && (
          <div
            className="absolute inset-x-0 bottom-0 p-3 bg-background border-t border-border/60"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          >
            <Button
              className="w-full h-12 rounded-xl text-sm font-semibold"
              variant={selected ? 'secondary' : 'default'}
              onClick={() => {
                onSelect(variety);
                onOpenChange(false);
              }}
            >
              {selected ? (
                <>
                  <Check className="h-4 w-4 mr-1.5" />
                  {t('schedule.variety.selected', 'Selected')}
                </>
              ) : (
                t('schedule.variety.use_this', 'Use this variety')
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default VarietyDetailSheet;
