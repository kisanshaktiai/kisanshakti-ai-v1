import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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

const LABEL_KEYS: Record<SatelliteWaterLayerCode, string> = {
  surface_water_trace: 'ndvi.water.surface_water_trace',
  canopy_moisture_signal: 'ndvi.water.canopy_moisture_signal',
};

const DESCRIPTION_KEYS: Record<SatelliteWaterLayerCode, string> = {
  surface_water_trace: 'ndvi.water.surface_water_trace_description',
  canopy_moisture_signal: 'ndvi.water.canopy_moisture_signal_description',
};

const ICONS: Record<SatelliteWaterLayerCode, typeof Droplets> = {
  surface_water_trace: Droplets,
  canopy_moisture_signal: Waves,
};

export function SatelliteWaterLayerPanel({ layers, selectedCode, onSelect, loading, error }: Props) {
  const { t } = useTranslation();
  const latest = useMemo(
    () => layers.find((item) => item.layer_code === selectedCode) ?? layers[0] ?? null,
    [layers, selectedCode],
  );
  const SelectedIcon = ICONS[selectedCode];
  const selectedLabel = t(LABEL_KEYS[selectedCode], selectedCode.replaceAll('_', ' '));

  return (
    <section className="space-y-3 rounded-2xl border border-border/40 bg-card p-3 shadow-sm" aria-label={t('ndvi.water.aria', 'Satellite water evidence')}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{t('ndvi.water.title', 'Water evidence')}</div>
          <p className="text-[10px] text-muted-foreground">{t('ndvi.water.select_hint', 'Select a layer to show its field image.')}</p>
        </div>
        <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(LABEL_KEYS) as SatelliteWaterLayerCode[]).map((code) => {
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
              <span className="block text-[11px] font-semibold leading-tight">
                {t(LABEL_KEYS[code], code.replaceAll('_', ' '))}
              </span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('ndvi.water.loading', 'Loading {{layer}}…', { layer: selectedLabel.toLowerCase() })}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && latest ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SelectedIcon className="h-4 w-4 text-primary" aria-hidden />
            <div>
              <p className="text-xs font-semibold">{selectedLabel}</p>
              <p className="text-[10px] text-muted-foreground">
                {t(DESCRIPTION_KEYS[selectedCode], selectedCode === 'surface_water_trace'
                  ? 'Satellite MNDWI evidence for surface-water signal.'
                  : 'Satellite NDMI evidence for canopy moisture signal.')}
              </p>
            </div>
          </div>

          {latest.signedImageUrl ? (
            <figure className="overflow-hidden rounded-xl border border-border/40 bg-muted/20">
              <img
                key={`${latest.layer_code}:${latest.scene_id}:${latest.acquisition_date}`}
                src={latest.signedImageUrl}
                alt={`${selectedLabel} — ${latest.acquisition_date}`}
                className="block aspect-square w-full object-contain"
                loading="eager"
                decoding="async"
              />
              <figcaption className="px-2.5 py-2 text-[10px] text-muted-foreground">
                {latest.acquisition_date} · Sentinel-2 · {latest.valid_fraction == null
                  ? t('ndvi.water.support_unavailable', 'support unavailable')
                  : t('ndvi.water.valid_support', '{{value}}% valid support', { value: (latest.valid_fraction * 100).toFixed(1) })}
              </figcaption>
            </figure>
          ) : (
            <div className="rounded-xl border border-dashed px-3 py-4 text-xs text-muted-foreground">
              {t('ndvi.water.image_unavailable', 'Evidence record exists, but its private image is not currently available.')}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <Metric label={t('ndvi.map.mean', 'Mean')} value={latest.value_mean} />
            <Metric label={t('ndvi.water.median', 'Median')} value={latest.value_median} />
            <Metric label={t('ndvi.water.effective_pixels', 'Effective pixels')} value={latest.effective_pixel_count} />
          </div>
          <p className="text-[9px] text-muted-foreground leading-snug">
            {t('ndvi.water.disclaimer', 'Satellite evidence only. This layer does not by itself confirm water stress, pest attack, or disease.')}
          </p>
        </div>
      ) : !loading ? (
        <div className="rounded-xl border border-dashed px-3 py-4 text-xs text-muted-foreground">
          {t('ndvi.water.no_observed', 'No observed {{layer}} is available for this field.', { layer: selectedLabel.toLowerCase() })}
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
