import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, ChevronRight, Droplets, Leaf, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { loadSoilState, resolveSoilSources, type SoilSourceKey } from '@/services/soil/soilReport';
import { bestReadings } from '@/lib/soilBestReadings';
import { soilVerdictLines } from '@/components/soil/SoilVerdictCard';
import { SoilReadingCard, NutrientTrio } from '@/components/soil/SoilVisuals';
import { SOIL_SOURCE_ICON, SOIL_SOURCE_ORDER } from '@/components/soil/soilSourceMeta';

/** Soil at a glance on the land page; every value comes from a saved soil report and says which one. */
export function LandSoilSummary({ landId }: { landId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const { speak, stop, isSpeaking } = useTextToSpeech();
  const q = useQuery({
    queryKey: ['land-soil-summary', landId, session?.farmerId, session?.tenantId],
    enabled: !!session?.farmerId && !!session?.tenantId,
    queryFn: () => loadSoilState(landId, session!.farmerId!, session!.tenantId!),
    retry: 1, staleTime: 60_000,
  });
  const sources = resolveSoilSources(q.data);
  const r = bestReadings(sources, q.data?.ratings);
  const any = [r.ph, r.oc, r.n, r.p, r.k].some((x) => x.reading.value !== null);
  const lines = any ? soilVerdictLines({ ph: r.ph.reading, oc: r.oc.reading, n: r.n.reading, p: r.p.reading, k: r.k.reading }, t, i18n.language) : [];
  const sourceNote = (s: SoilSourceKey | null) => (s ? t('soil.fromSource', { source: t(`soil.sourceTypes.${s}`) }) : null);
  const open = () => navigate(`/app/lands/${landId}/soil`);

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <header className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-card to-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Sparkles className="h-4 w-4 text-primary" />{t('lands.details.soil_ai_title')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('lands.details.soil_ai_sub')}</p>
          </div>
          {lines.length > 0 && (
            <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-11 w-11 shrink-0 rounded-xl" aria-label={t('soil.readAloud')}
              onClick={() => (isSpeaking ? stop() : speak(lines.join(' ')))}>
              <Volume2 className={cn('h-5 w-5', isSpeaking && 'animate-pulse text-primary')} />
            </Button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t('soil.reportTypes')}>
          {SOIL_SOURCE_ORDER.map((key) => {
            const Icon = SOIL_SOURCE_ICON[key];
            const has = !!sources[key];
            return (
              <span key={key} className={cn('flex items-center gap-1 rounded-full border px-2.5 py-1 lf-cap font-medium',
                has ? 'border-primary/30 bg-background text-foreground' : 'border-dashed border-border bg-background/60 text-muted-foreground')}>
                <Icon className={cn('h-3.5 w-3.5', has ? 'text-primary' : 'text-muted-foreground')} />
                {t(`soil.sourceTypes.${key}`)}
                <span className={cn('ml-0.5 h-1.5 w-1.5 rounded-full', has ? 'bg-success' : 'bg-muted-foreground/30')} aria-hidden />
                <span className="sr-only">{t(has ? 'soil.available' : 'soil.notAvailable')}</span>
              </span>
            );
          })}
        </div>
        {lines.length > 0 && (
          <ul className="mt-3 space-y-1">
            {lines.map((line) => <li key={line} className="flex gap-2 text-sm leading-snug text-foreground"><span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{line}</li>)}
          </ul>
        )}
      </header>

      <div className="space-y-3 p-4">
        {q.isPending ? <Skeleton className="h-48 w-full rounded-2xl" /> : q.isError ? (
          <div className="rounded-2xl bg-muted/50 p-4 text-center">
            <p className="text-sm font-medium text-foreground">{t('soil.loadError')}</p>
            <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={() => q.refetch()}>{t('soil.checkAgain')}</Button>
          </div>
        ) : any ? (
          <>
            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
              <SoilReadingCard icon={Droplets} title={t('soil.ph')} reading={r.ph.reading} scale="ph" help={sourceNote(r.ph.source)} className="p-3.5" />
              <SoilReadingCard icon={Leaf} title={t('soil.organicCarbon')} reading={r.oc.reading} unit="%" scale="banded" digits={2} help={sourceNote(r.oc.source)} className="p-3.5" />
            </div>
            <NutrientTrio lockedLabel={t('soil.needsLab')} readings={[
              { letter: 'N', name: t('soil.nutrientName.n'), reading: r.n.reading, unit: 'kg/ha' },
              { letter: 'P', name: t('soil.nutrientName.p'), reading: r.p.reading, unit: 'kg/ha' },
              { letter: 'K', name: t('soil.nutrientName.k'), reading: r.k.reading, unit: 'kg/ha' },
            ]} />
          </>
        ) : (
          <p className="rounded-2xl bg-muted/50 p-4 text-center text-sm text-muted-foreground">{t('soil.summaryEmpty')}</p>
        )}
        <Button className="min-h-12 w-full rounded-2xl" onClick={open}>
          {any ? t('lands.details.open_soil_report') : t('lands.details.add_soil_test')}<ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
