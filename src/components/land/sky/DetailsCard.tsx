import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { FieldSky } from '@/hooks/useFieldSky';

/**
 * "The numbers behind the words." A plain read-out of the values the other
 * cards were built from. Anything the governed sources did not provide is
 * shown as not available — never filled in.
 */
export function DetailsCard({ sky }: { sky: FieldSky }) {
  const { t } = useTranslation();
  const na = t('sky.details.na', 'Not available');
  const fmt = (v: number | null | undefined, digits = 2) => (v === null || v === undefined || !Number.isFinite(v) ? na : v.toFixed(digits));

  const rows: Array<{ label: string; value: string }> = [
    { label: t('sky.details.ndvi', 'Crop greenness (NDVI)'), value: fmt(sky.latest?.ndvi_value ?? null) },
    { label: t('sky.details.ndvi_prev', 'Previous reading'), value: fmt(sky.previous?.ndvi_value ?? null) },
    { label: t('sky.details.date', 'Reading date'), value: sky.latest?.acquisition_date ? String(sky.latest.acquisition_date).slice(0, 10) : na },
    { label: t('sky.details.cloud', 'Cloud cover (%)'), value: fmt(sky.sky.cloudPct, 0) },
    { label: t('sky.details.seen', 'Field seen (%)'), value: fmt(sky.sky.fieldSeenPct, 0) },
    { label: t('sky.details.stage', 'Crop stage'), value: sky.stage.stageName ?? sky.stage.stageCode ?? na },
    { label: t('sky.details.das', 'Days after sowing'), value: sky.stage.das == null ? na : String(sky.stage.das) },
    { label: t('sky.details.ndmi', 'Moisture signal (NDMI)'), value: fmt(sky.water.ndmi) },
    { label: t('sky.details.ndre', 'Leaf nitrogen signal (NDRE)'), value: fmt(sky.greenness.ndre) },
    { label: t('sky.details.rain', 'Recent rain (mm)'), value: fmt(sky.water.rainMm, 1) },
  ];

  return (
    <Card className="rounded-3xl border border-border/40">
      <CardContent className="p-2">
        <Accordion type="single" collapsible>
          <AccordionItem value="details" className="border-none">
            <AccordionTrigger className="px-2 py-3 hover:no-underline">
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('sky.details.title', 'The numbers behind this')}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-2 pb-2">
              <dl className="divide-y divide-border/40">
                {rows.map(r => (
                  <div key={r.label} className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-sm text-muted-foreground">{r.label}</dt>
                    <dd className="text-sm font-semibold text-right">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
