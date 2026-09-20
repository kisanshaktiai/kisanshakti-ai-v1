import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ComposedChart, Area, Line, XAxis, YAxis, ReferenceArea, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import type { FieldSky } from '@/hooks/useFieldSky';
import { CropStageFigure } from '@/components/land/sky/CropStageFigure';

/**
 * "Season so far, and the next two weeks." The field's own curve on top of the
 * expected band for its current stage (crop_stage_master), with the pipeline's
 * forecast as a dashed tail and its interval shaded. Cloud gaps stay gaps.
 * No axis numbers for the farmer — the picture is the point.
 */
export function SeasonCard({ sky }: { sky: FieldSky }) {
  const { t } = useTranslation();
  const data = useMemo(() => {
    const pts = [...sky.history].sort((a, b) => a.date.localeCompare(b.date)).map(h => ({ date: h.date, ndvi: h.ndvi, kind: 'seen' as const }));
    // break the line across gaps longer than 20 days so smoothing never hides a cloudy month
    const withGaps: Array<{ date: string; ndvi?: number | null; f_low?: number | null; f_high?: number | null; f_mid?: number | null }> = [];
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) {
        const gap = (new Date(pts[i].date).getTime() - new Date(pts[i - 1].date).getTime()) / 86400000;
        if (gap > 20) withGaps.push({ date: pts[i - 1].date + '_gap', ndvi: null });
      }
      withGaps.push(pts[i]);
    }
    if (sky.forecast && pts.length) {
      const last = pts[pts.length - 1];
      withGaps.push({ date: last.date, f_low: last.ndvi, f_high: last.ndvi, f_mid: last.ndvi });
      withGaps.push({ date: sky.forecast.targetDate, f_low: sky.forecast.low, f_high: sky.forecast.high, f_mid: (Number(sky.forecast.low) + Number(sky.forecast.high)) / 2 });
    }
    return withGaps;
  }, [sky.history, sky.forecast]);

  const band = sky.stage.expectedMin != null && sky.stage.expectedMax != null;
  const caption = (() => {
    if (sky.stage.state === 'no_sowing_date') return t('sky.season.need_sowing', 'Add your sowing date to see what the crop should look like at each stage.');
    if (sky.stage.state === 'below') return t('sky.season.below', 'Below the expected range for {{stage}}.', { stage: sky.stage.stageName ?? '' });
    if (sky.stage.state === 'within') return t('sky.season.within', 'Within the expected range for {{stage}}.', { stage: sky.stage.stageName ?? '' });
    if (sky.stage.state === 'above') return t('sky.season.above', 'Above the expected range for {{stage}}.', { stage: sky.stage.stageName ?? '' });
    return t('sky.season.no_band', 'No expected range is set for this stage yet.');
  })();

  const figure = sky.stage.index != null ? <CropStageFigure sky={sky} /> : null;

  if (sky.history.length < 2) {
    return <>{figure}<Card className="rounded-3xl border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground">{t('sky.season.need_more', 'Once the satellite has two clear views, your season curve appears here.')}</CardContent></Card></>;
  }

  return (<>
    {figure}
    <Card className="rounded-3xl border-border/40">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t('sky.season.title', 'Season so far')}</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" hide />
              <YAxis domain={[0, 1]} hide />
              {band && <ReferenceArea y1={sky.stage.expectedMin!} y2={sky.stage.expectedMax!} fill="hsl(var(--success))" fillOpacity={0.12} />}
              <Area type="monotone" dataKey="f_high" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.12} connectNulls />
              <Area type="monotone" dataKey="f_low" stroke="none" fill="hsl(var(--background))" fillOpacity={1} connectNulls />
              <Line type="monotone" dataKey="f_mid" stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeWidth={2} dot={false} connectNulls />
              <Area type="monotone" dataKey="ndvi" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="hsl(var(--primary))" fillOpacity={0.15} connectNulls={false} dot={{ r: 3, fill: 'hsl(var(--primary))' }} />
              <Tooltip formatter={(v: unknown) => (v == null ? '—' : Number(v).toFixed(2))} labelFormatter={(l: unknown) => String(l).replace('_gap', '')} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-2">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-4 rounded-sm bg-success/30" />{t('sky.season.legend_band', 'expected now')}</span>
          <span className="inline-flex items-center gap-1"><i className="h-0.5 w-4 bg-primary" />{t('sky.season.legend_seen', 'seen')}</span>
          {sky.forecast && <span className="inline-flex items-center gap-1"><i className="h-0.5 w-4 border-t-2 border-dashed border-primary" />{t('sky.season.legend_forecast', 'forecast')}</span>}
        </div>
        <p className="text-sm font-medium mt-2">{caption}</p>
      </CardContent>
    </Card>
  </>);
}
