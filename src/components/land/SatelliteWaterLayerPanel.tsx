import React, { useMemo } from 'react';
import { Droplets, Waves, Info, Loader2 } from 'lucide-react';
import type { SatelliteWaterLayerCode } from '@/types/satelliteWater';
import type { SatelliteWaterLayerView } from '@/hooks/useSatelliteWaterLayers';

interface Props {
  layers: SatelliteWaterLayerView[];
  selectedCode: SatelliteWaterLayerCode;
  onSelect: (code: SatelliteWaterLayerCode) => void;
  loading?: boolean;
  error?: string | null;
}

const LABELS: Record<SatelliteWaterLayerCode, string> = {
  surface_water_trace: 'Surface-water trace',
  canopy_moisture_signal: 'Canopy moisture signal',
};

const DESCRIPTIONS: Record<SatelliteWaterLayerCode, string> = {
  surface_water_trace: 'Satellite MNDWI evidence for surface-water signal.',
  canopy_moisture_signal: 'Satellite NDMI evidence for canopy moisture signal.',
};

const ICONS: Record<SatelliteWaterLayerCode, typeof Droplets> = {
  surface_water_trace: Droplets,
  canopy_moisture_signal: Waves,
};

export function SatelliteWaterLayerPanel({ layers, selectedCode, onSelect, loading, error }: Props) {
  const latest = useMemo(() => layers.find((item) => item.layer_code === selectedCode) ?? layers[0] ?? null, [layers, selectedCode]);
  const SelectedIcon = ICONS[selectedCode];

  return (
    <section className="space-y-3 rounded-2xl border border-border/40 bg-card p-3 shadow-sm" aria-label="Satellite water evidence">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Water evidence</div>
          <p className="text-[10px] text-muted-foreground">Select a layer to show its field image.</p>
        </div>
        <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(LABELS) as SatelliteWaterLayerCode[]).map((code) => {
          const Icon = ICONS[code];
          const selected = selectedCode === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onSelect(code)}
              aria-pressed={selected}
              className={`min-h-20 rounded-xl border px-3 py-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 ${selected ? 'border-primary bg-primary/10 shadow-sm' : 'bg-background hover:bg-muted/40'}`}
            >
              <Icon className={`h-5 w-5 mb-1 ${selected ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
              <span className="block text-[11px] font-semibold leading-tight">{LABELS[code]}</span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading {LABELS[selectedCode].toLowerCase()}…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && latest ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SelectedIcon className="h-4 w-4 text-primary" aria-hidden />
            <div>
              <p className="text-xs font-semibold">{LABELS[selectedCode]}</p>
              <p className="text-[10px] text-muted-foreground">{DESCRIPTIONS[selectedCode]}</p>
            </div>
          </div>

          {latest.signedImageUrl ? (
            <figure className="overflow-hidden rounded-xl border border-border/40 bg-muted/20">
              <img
                key={`${latest.layer_code}:${latest.scene_id}:${latest.acquisition_date}`}
                src={latest.signedImageUrl}
                alt={`${LABELS[selectedCode]} — ${latest.acquisition_date}`}
                className="block aspect-square w-full object-contain"
                loading="eager"
                decoding="async"
              />
              <figcaption className="px-2.5 py-2 text-[10px] text-muted-foreground">
                {latest.acquisition_date} · Sentinel-2 evidence · {latest.valid_fraction == null ? 'support unavailable' : `${(latest.valid_fraction * 100).toFixed(1)}% valid support`}
              </figcaption>
            </figure>
          ) : (
            <div className="rounded-xl border border-dashed px-3 py-4 text-xs text-muted-foreground">
              Evidence record exists, but its private image is not currently available.
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <Metric label="Mean" value={latest.value_mean} />
            <Metric label="Median" value={latest.value_median} />
            <Metric label="Effective pixels" value={latest.effective_pixel_count} />
          </div>
          <p className="text-[9px] text-muted-foreground leading-snug">
            Satellite evidence only. This layer does not by itself confirm water stress, pest attack, or disease.
          </p>
        </div>
      ) : !loading ? (
        <div className="rounded-xl border border-dashed px-3 py-4 text-xs text-muted-foreground">
          No observed {LABELS[selectedCode].toLowerCase()} is available for this field.
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2 text-center">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value == null ? '—' : value.toFixed(2)}</p>
    </div>
  );
}
