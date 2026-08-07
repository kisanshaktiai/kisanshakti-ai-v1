import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Droplets, Sprout, Bug, Thermometer, Waves, Gauge, MapPin, AlertTriangle, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LandWeatherState } from '@/hooks/useLandWeatherState';

interface LandAgronomyPanelProps {
  state: LandWeatherState | null;
  landName?: string | null;
  isToday: boolean;
  isLoading?: boolean;
}

const urgencyTone = (v?: string | null) => {
  const s = (v ?? '').toUpperCase();
  if (s.includes('CRITICAL') || s.includes('URGENT') || s === 'HIGH') return 'text-destructive';
  if (s === 'MEDIUM' || s === 'MODERATE') return 'text-warning';
  if (s === 'LOW' || s === 'NONE') return 'text-success';
  return 'text-muted-foreground';
};

const riskTone = (v?: string | null) => {
  const s = (v ?? '').toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH' || s === 'SEVERE') return 'text-destructive';
  if (s === 'MODERATE' || s === 'MEDIUM') return 'text-warning';
  if (s === 'LOW' || s === 'NONE') return 'text-success';
  return 'text-muted-foreground';
};

const num = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '--' : Number(v).toFixed(digits);

const pretty = (v?: string | null) =>
  !v ? '--' : v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const LandAgronomyPanel: React.FC<LandAgronomyPanelProps> = ({
  state, landName, isToday, isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="px-4 py-3">
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="h-20 animate-pulse rounded-xl bg-muted/50" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="px-4 py-3">
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Field metrics not computed yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Soil-aware irrigation, ET0 and disease risk appear once the daily
                field computation runs for this land.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const metrics = [
    {
      icon: Droplets,
      label: 'Irrigation',
      value: pretty(state.irrigation_urgency) || (state.irrigation_needed ? 'Needed' : 'Not needed'),
      sub: `Deficit ${num(state.water_deficit_mm)} mm`,
      tone: urgencyTone(state.irrigation_urgency),
    },
    {
      icon: Waves,
      label: 'ET0',
      value: `${num(state.et0_mm)} mm`,
      sub: `Eff. rain ${num(state.effective_rainfall_mm)} mm`,
      tone: 'text-info',
    },
    {
      icon: Gauge,
      label: 'VPD',
      value: `${num(state.vpd_kpa, 2)} kPa`,
      sub: `Rain ${num(state.total_rainfall_mm)} mm`,
      tone: 'text-foreground/80',
    },
    {
      icon: Sprout,
      label: 'GDD today',
      value: num(state.gdd_daily, 1),
      sub: pretty(state.water_balance_status),
      tone: 'text-success',
    },
    {
      icon: Bug,
      label: 'Disease risk',
      value: pretty(state.disease_risk_level),
      sub: state.disease_risk_score !== null ? `Score ${num(state.disease_risk_score, 0)}` : '--',
      tone: riskTone(state.disease_risk_level),
    },
    {
      icon: Thermometer,
      label: 'Crop stress',
      value: pretty(state.crop_stress_level),
      sub: `Soil ${pretty(state.soil_type_used)}`,
      tone: riskTone(state.crop_stress_level),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-4 py-3"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Field intelligence
          {landName && <span className="text-xs font-medium text-muted-foreground">· {landName}</span>}
        </h3>
        <Badge variant="secondary" className="text-[10px]">
          {isToday ? 'Today' : `As of ${state.metric_date?.slice(0, 10)}`}
        </Badge>
      </div>

      {!isToday && (
        <div className="flex items-center gap-2 mb-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
          <p className="text-[11px] text-foreground/80">
            Showing the last computed day. Today's field metrics are not ready yet.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm"
          >
            <div className="flex flex-col items-center text-center gap-0.5">
              <m.icon className={cn('h-4 w-4', m.tone)} />
              <span className={cn('text-sm font-bold leading-tight', m.tone)}>{m.value}</span>
              <span className="text-[10px] text-muted-foreground font-medium">{m.label}</span>
              <span className="text-[9px] text-muted-foreground/80 leading-tight">{m.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[9px] text-muted-foreground mt-2">
        Computed for this field only
        {state.computed_at ? ` · ${new Date(state.computed_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}` : ''}
        {state.confidence !== null && state.confidence !== undefined
          ? ` · confidence ${Math.round(Number(state.confidence) * 100)}%`
          : ''}
      </p>
    </motion.div>
  );
};
