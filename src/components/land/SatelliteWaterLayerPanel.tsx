import React, { useMemo } from 'react';
import type { SatelliteWaterLayer, SatelliteWaterLayerCode } from '@/types/satelliteWater';

interface Props {
  layers: SatelliteWaterLayer[];
  selectedCode: SatelliteWaterLayerCode;
  onSelect: (code: SatelliteWaterLayerCode) => void;
}

const LABELS: Record<SatelliteWaterLayerCode, string> = {
  surface_water_trace: 'Surface-water trace',
  canopy_moisture_signal: 'Canopy moisture signal',
};

export function SatelliteWaterLayerPanel({ layers, selectedCode, onSelect }: Props) {
  const latest = useMemo(() => {
    const row = layers.find((item) => item.layer_code === selectedCode);
    return row ?? null;
  }, [layers, selectedCode]);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="text-sm font-semibold">Water evidence</div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LABELS) as SatelliteWaterLayerCode[]).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => onSelect(code)}
            className={`rounded-md border px-3 py-2 text-sm ${selectedCode === code ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
          >
            {LABELS[code]}
          </button>
        ))}
      </div>
      {latest ? (
        <div className="text-xs text-muted-foreground">
          <div>Observation: {latest.acquisition_date}</div>
          <div>Valid support: {latest.valid_fraction == null ? '—' : `${(latest.valid_fraction * 100).toFixed(1)}%`}</div>
          <div className="mt-1">This is satellite evidence, not a confirmed water-stress diagnosis.</div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">No observed layer is available for this field.</div>
      )}
    </div>
  );
}
