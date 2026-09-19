import { useTranslation } from 'react-i18next';
import { Bug, Loader2, Info } from 'lucide-react';
import { useLandPestFindings } from '@/hooks/useLandPestFindings';

/**
 * Pest evidence panel.
 *
 * Deliberately honest: no satellite pest imagery exists in this system, so nothing
 * is rendered as a "pest map". Only real recorded pest/disease findings for the field
 * are shown; when there are none, the panel says so instead of inventing an image.
 */
export function SatellitePestPanel({ landId }: { landId?: string }) {
  const { t } = useTranslation();
  const { data: findings = [], isLoading } = useLandPestFindings(landId);

  return (
    <section className="space-y-3 rounded-2xl border border-border/40 bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Bug className="h-4 w-4 text-primary" aria-hidden />
            {t('ndvi.pest.title', 'Pest & disease findings')}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t('ndvi.pest.subtitle', 'From field scans and alerts for this field.')}
          </p>
        </div>
        <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('ndvi.pest.loading', 'Loading findings…')}
        </div>
      )}

      {!isLoading && findings.length > 0 && (
        <ul className="space-y-2">
          {findings.map((f) => (
            <li key={f.id} className="rounded-xl border border-border/40 bg-background px-3 py-2">
              <p className="text-xs font-semibold leading-tight">{f.title ?? f.alert_type}</p>
              {f.message && <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{f.message}</p>}
              <p className="text-[9px] text-muted-foreground mt-1">
                {new Date(f.created_at).toLocaleDateString()}
                {f.priority ? ` · ${f.priority}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && findings.length === 0 && (
        <div className="rounded-xl border border-dashed px-3 py-4 text-[11px] leading-snug text-muted-foreground">
          {t('ndvi.pest.none', 'No pest or disease finding has been recorded for this field yet.')}
        </div>
      )}

      <p className="text-[9px] text-muted-foreground leading-snug">
        {t('ndvi.pest.no_satellite_layer', 'Satellites do not photograph pests. Pest and disease evidence comes from field scans and ground observation, never from the satellite image.')}
      </p>
    </section>
  );
}
