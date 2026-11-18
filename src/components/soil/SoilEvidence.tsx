import { useTranslation } from 'react-i18next';
import { Info, ListTree } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { SoilModel } from '@/services/soil/soilReport';
import { useSoilNumber } from '@/components/soil/SoilVisuals';

/** Every number behind the picture, folded away for those who want it. */
export function SoilAllValues({ rows }: { rows: Array<{ key: string; label: string; value: number | null; unit: string; digits?: number }> }) {
  const { t } = useTranslation();
  const fmt = useSoilNumber();
  const shown = rows.filter((r) => r.value !== null);
  if (!shown.length) return null;
  return (
    <Accordion type="single" collapsible className="rounded-3xl border border-border bg-card px-4 shadow-sm">
      <AccordionItem value="values" className="border-none">
        <AccordionTrigger className="min-h-12 text-sm font-semibold hover:no-underline">
          <span className="flex items-center gap-2"><ListTree className="h-4 w-4 text-primary" />{t('soil.allValues')}</span>
        </AccordionTrigger>
        <AccordionContent>
          <dl className="grid grid-cols-2 gap-2">
            {shown.map((r) => (
              <div key={r.key} className="rounded-2xl bg-muted/50 p-3">
                <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
                <dd className="mt-0.5 text-base font-bold tabular-nums text-foreground">{fmt(r.value, r.digits ?? 2)}{r.unit && <span className="ml-1 text-[11px] font-medium text-muted-foreground">{r.unit}</span>}</dd>
              </div>
            ))}
          </dl>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/** How the satellite estimate was made: sampling sketch, coverage and the limits of a soil map. */
export function SoilHowEstimated({ model }: { model: SoilModel }) {
  const { t, i18n } = useTranslation();
  const fmt = useSoilNumber();
  const points = model.sampling.points || [];
  const xs = points.map((p) => p.x_m), ys = points.map((p) => p.y_m);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), dx = Math.max(...xs) - x0 || 1, dy = Math.max(...ys) - y0 || 1;
  const plot = points.map((p) => ({ x: 20 + 260 * (p.x_m - x0) / dx, y: 145 - 125 * (p.y_m - y0) / dy, order: p.order }));
  return (
    <Accordion type="single" collapsible className="rounded-3xl border border-border bg-card px-4 shadow-sm">
      <AccordionItem value="how" className="border-none">
        <AccordionTrigger className="min-h-12 text-sm font-semibold hover:no-underline">
          <span className="flex items-center gap-2"><Info className="h-4 w-4 text-primary" />{t('soil.howEstimated')}</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3">
          <p className="text-sm text-foreground">{t('soil.coverageLine', { count: model.sampling.generated_points, area: fmt(model.area_m2 / 10000, 2) })}</p>
          {plot.length > 0 && (
            <svg viewBox="0 0 300 165" className="w-full rounded-2xl border border-border bg-muted/30" role="img" aria-label={t('soil.samplingCoverage')}>
              <polyline points={plot.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" className="text-primary/40" strokeWidth="2" strokeDasharray="5 4" />
              {plot.map((p) => <g key={p.order}><circle cx={p.x} cy={p.y} r="9" fill="currentColor" className="text-primary" /><text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="8" fill="currentColor" className="text-primary-foreground">{p.order}</text></g>)}
            </svg>
          )}
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>{t('soil.pixelHelp')}</li>
            <li>{t('soil.sketchHelp')}</li>
            <li>{t('soil.modelledNotice')}</li>
            <li>{t('soil.nutrientNotice')}</li>
            <li>{t('soil.retrieved')}: {new Date(model.retrieved_at).toLocaleDateString(i18n.language)} · {model.source_version}</li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
