import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soilNumber, type SoilModel } from '@/services/soil/soilReport';
import { useSoilNumber } from '@/components/soil/SoilVisuals';

const DEPTHS = ['0-5cm', '5-15cm', '15-30cm'] as const;
// Picture of the soil column: deeper layers drawn darker, heights follow layer thickness (5 / 10 / 15 cm).
const LAYER_SHADE = ['bg-foreground/10', 'bg-foreground/20', 'bg-foreground/30'];
const LAYER_HEIGHT = ['h-12', 'h-16', 'h-20'];
const PROPERTIES = [
  { key: 'phh2o', label: 'ph', unit: '', digits: 1 },
  { key: 'soc', label: 'organicCarbon', unit: '%', digits: 2 },
  { key: 'clay', label: 'clay', unit: '%', digits: 0 },
  { key: 'cec', label: 'cec', unit: 'cmol(+)/kg', digits: 1 },
] as const;

/** The soil column under the field, layer by layer, for one property at a time. */
export function SoilDepthProfile({ model }: { model: SoilModel }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const fmt = useSoilNumber();
  const [prop, setProp] = useState<(typeof PROPERTIES)[number]['key']>('phh2o');
  const meta = PROPERTIES.find((p) => p.key === prop)!;
  const values = DEPTHS.map((d) => soilNumber(model.properties[prop]?.[d]?.mean));
  const max = Math.max(...values.map((v) => v ?? 0)) || 1;

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10"><Layers className="h-4 w-4 text-primary" /></span>
        {t('soil.depthProfile')}
      </h2>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t('soil.depthProfile')}>
        {PROPERTIES.map((p) => (
          <button key={p.key} type="button" onClick={() => setProp(p.key)} aria-pressed={prop === p.key}
            className={cn('min-h-10 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition-colors',
              prop === p.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground')}>
            {t(`soil.${p.label}`)}
          </button>
        ))}
      </div>
      <div className="mt-4 flex gap-3">
        <div className="w-14 shrink-0 overflow-hidden rounded-2xl border border-border" aria-hidden>
          <div className="h-2 bg-success/40" />
          {DEPTHS.map((d, i) => <div key={d} className={cn(LAYER_HEIGHT[i], LAYER_SHADE[i], 'border-t border-background/60')} />)}
        </div>
        <ul className="flex-1">
          <li className="h-2" aria-hidden />
          {DEPTHS.map((d, i) => {
            const v = values[i];
            const layer = model.properties[prop]?.[d];
            return (
              <li key={d} className={cn(LAYER_HEIGHT[i], 'flex flex-col justify-center border-t border-dashed border-border')}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{t('soil.depthRange', { range: d.replace('cm', '').replace('-', '–') })}</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">{fmt(v, meta.digits)}{v !== null && meta.unit && <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">{meta.unit}</span>}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  {v !== null && <motion.div className="h-full rounded-full bg-primary" initial={{ width: reduceMotion ? `${(v / max) * 100}%` : '0%' }}
                    animate={{ width: `${(v / max) * 100}%` }} transition={{ duration: 0.6, delay: reduceMotion ? 0 : i * 0.1 }} />}
                </div>
                {layer && layer.quality !== 'complete' && <span className="mt-0.5 text-[10px] text-muted-foreground">{t('soil.limitedCoverage')}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
