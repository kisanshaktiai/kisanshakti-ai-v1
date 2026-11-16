import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, FlaskConical, Satellite, Cpu, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/authStore';
import { loadSoilState } from '@/services/soil/soilReport';
import { soilMetrics, measuredCount } from '@/lib/soilSummary';

const sourceIcon = (s?: string | null) => (s === 'soilgrid' || s === 'satellite' ? Satellite : s === 'device' || s === 'sensor' ? Cpu : FlaskConical);

/** AI-ready soil summary for one owned land; every value comes from the saved soil record. */
export function LandSoilSummary({ landId }: { landId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const q = useQuery({
    queryKey: ['land-soil-summary', landId, session?.farmerId, session?.tenantId],
    enabled: !!session?.farmerId && !!session?.tenantId,
    queryFn: () => loadSoilState(landId, session!.farmerId!, session!.tenantId!),
    retry: 1, staleTime: 60_000,
  });
  const row = q.data?.legacy ?? null;
  const metrics = soilMetrics(row);
  const count = measuredCount(metrics);
  const Icon = sourceIcon(row?.source);
  const fmt = (v: number | string) => typeof v === 'number' ? new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(v) : v;
  const open = () => navigate(`/app/lands/${landId}/soil`);

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <header className="flex items-start justify-between gap-3 bg-gradient-to-br from-primary/10 via-card to-card p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Sparkles className="h-4 w-4 text-primary" />{t('lands.details.soil_ai_title')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('lands.details.soil_ai_sub')}</p>
        </div>
        {row?.source && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground">
            <Icon className="h-3.5 w-3.5 text-primary" />{t(`soil.sources.${row.source}`, { defaultValue: row.source })}
          </span>
        )}
      </header>

      <div className="space-y-3 p-4">
        {q.isPending ? <Skeleton className="h-40 w-full rounded-2xl" /> : q.isError ? (
          <div className="rounded-2xl bg-muted/50 p-4 text-center">
            <p className="text-sm font-medium text-foreground">{t('soil.loadError')}</p>
            <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={() => q.refetch()}>{t('soil.checkAgain')}</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('lands.details.measured_count', { count, total: metrics.length })}</span>
              {row?.test_date && <span>{new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(row.test_date))}</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${(count / metrics.length) * 100}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {metrics.map((m) => {
                const has = m.value !== null && m.value !== '';
                return (
                  <div key={m.key} className={`rounded-2xl border p-3 ${has ? 'border-border bg-background' : 'border-dashed border-border bg-muted/30'}`}>
                    <p className="text-[11px] font-medium text-muted-foreground">{t(`soil.${m.key}`)}</p>
                    {has ? (
                      <p className="mt-1 text-lg font-bold text-foreground">{fmt(m.value!)}{m.unit && <span className="ml-1 text-xs font-medium text-muted-foreground">{m.unit}</span>}</p>
                    ) : (
                      <p className="mt-1 text-sm font-semibold text-muted-foreground">{t('lands.details.needs_test')}</p>
                    )}
                    {has && (m.level || m.text) && <p className="mt-0.5 line-clamp-2 text-[11px] text-primary">{m.level || m.text}</p>}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1 rounded-full" onClick={open}>
                {count ? t('lands.details.open_soil_report') : t('lands.details.add_soil_test')}<ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
