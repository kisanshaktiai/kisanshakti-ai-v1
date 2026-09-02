import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Droplets, Calendar, MapPin, Shield, Sprout, Award, TrendingUp } from 'lucide-react';
import { useVarietyResistance, type CropVariety } from '@/hooks/useCropVarieties';
import { cn } from '@/lib/utils';
import { useThreatNames } from '@/lib/threatLocalName';
import { useTranslation } from 'react-i18next';

interface VarietyDetailCardProps {
  variety: CropVariety;
  className?: string;
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

export const VarietyDetailCard: React.FC<VarietyDetailCardProps> = ({ variety, className }) => {
  const { t, i18n } = useTranslation();
  const { rows: resistance, loading } = useVarietyResistance(variety.id);
  const { resolve: resolveThreat } = useThreatNames();

  const lang = i18n.language;
  const localName =
    lang === 'hi' ? variety.label_hi :
    lang === 'mr' ? variety.label_mr : null;

  const irrigation: string | null =
    variety.agro_ecological_suitability?.irrigation_regime ||
    variety.agro_ecological_suitability?.water_requirement ||
    null;

  const states = Array.isArray(variety.state_suitability) ? variety.state_suitability : [];

  return (
    <Card className={cn('border-primary/40 bg-gradient-to-br from-primary/5 to-accent/5', className)}>
      <CardContent className="p-3 space-y-3">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-sm">{variety.name}</span>
                {variety.variety_code && (
                  <Badge variant="outline" className="h-4 text-[10px] px-1">
                    {variety.variety_code}
                  </Badge>
                )}
              </div>
              {localName && <p className="text-xs text-muted-foreground">{localName}</p>}
              {variety.released_by && (
                <p className="text-[10px] text-muted-foreground italic">
                  {t('schedule.variety.released_by', 'Released by')} {variety.released_by}
                </p>
              )}
            </div>
            {variety.variety_completeness_score != null && (
              <Badge variant="secondary" className="h-5 text-[10px] flex items-center gap-0.5">
                <Award className="h-2.5 w-2.5" />
                {Math.round(Number(variety.variety_completeness_score))}%
              </Badge>
            )}
          </div>
        </div>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-background/60 border border-border/50 p-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {t('schedule.variety.maturity', 'Maturity')}
            </div>
            <div className="text-xs font-semibold mt-0.5">
              {variety.maturity_days_min && variety.maturity_days_max
                ? `${variety.maturity_days_min}–${variety.maturity_days_max} ${t('schedule.variety.days', 'days')}`
                : variety.maturity_days_max
                ? `~${variety.maturity_days_max} ${t('schedule.variety.days', 'days')}`
                : '—'}
            </div>
          </div>
          <div className="rounded-lg bg-background/60 border border-border/50 p-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              {t('schedule.variety.yield', 'Yield')}
            </div>
            <div className="text-xs font-semibold mt-0.5">
              {variety.yield_potential_qtl_per_acre != null
                ? `~${variety.yield_potential_qtl_per_acre} q/ac`
                : '—'}
            </div>
          </div>
          <div className="rounded-lg bg-background/60 border border-border/50 p-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Droplets className="h-3 w-3" />
              {t('schedule.variety.irrigation', 'Water')}
            </div>
            <div className="text-xs font-semibold mt-0.5 capitalize">
              {irrigation ? String(irrigation).replace(/_/g, ' ') : '—'}
            </div>
          </div>
          <div className="rounded-lg bg-background/60 border border-border/50 p-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Sprout className="h-3 w-3" />
              {t('schedule.variety.seed_rate', 'Seed rate')}
            </div>
            <div className="text-xs font-semibold mt-0.5">
              {variety.seed_rate_kg_per_acre != null
                ? `${variety.seed_rate_kg_per_acre} kg/ac`
                : '—'}
            </div>
          </div>
        </div>

        {/* Suitable states */}
        {states.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {t('schedule.variety.suitable_states', 'Suitable for')}
            </div>
            <div className="flex flex-wrap gap-1">
              {states.slice(0, 6).map((s) => (
                <Badge key={s} variant="outline" className="h-4 text-[10px] px-1.5">
                  {s}
                </Badge>
              ))}
              {states.length > 6 && (
                <Badge variant="outline" className="h-4 text-[10px] px-1.5">
                  +{states.length - 6}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Resistance */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Shield className="h-3 w-3" />
            {t('schedule.variety.resistance', 'Pest & disease resistance')}
          </div>
          {loading ? (
            <p className="text-[10px] text-muted-foreground italic">
              {t('schedule.variety.loading_resistance', 'Loading…')}
            </p>
          ) : resistance.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">
              {t('schedule.variety.no_resistance', 'No catalogued resistance data.')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {resistance.map((r, i) => {
                const nm = resolveThreat(r.pathogen.replace(/_/g, ' '));
                return (
                  <Badge
                    key={`${r.pathogen}-${i}`}
                    variant="outline"
                    className={cn(
                      'h-5 text-[10px] px-1.5 gap-1',
                      nm.localized ? '' : 'capitalize',
                      levelStyle(r.level)
                    )}
                    title={[nm.scientific, r.notes].filter(Boolean).join(' — ') || undefined}
                  >
                    <span className="font-medium">{nm.label}</span>
                    <span className="opacity-80">· {r.level.toUpperCase()}</span>
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default VarietyDetailCard;
