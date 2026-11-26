import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, RefreshCw, ScanLine, Database, MapPin, Loader2, Droplets, Leaf, Shapes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { soilNumber, type SoilRow, type SoilState } from '@/services/soil/soilReport';
import { readSoil, textureShares } from '@/lib/soilInterpretation';
import { SoilVerdictCard } from '@/components/soil/SoilVerdictCard';
import { SoilReadingCard, NutrientTrio, TextureBar } from '@/components/soil/SoilVisuals';
import { SoilDepthProfile } from '@/components/soil/SoilDepthProfile';
import { SoilAllValues, SoilHowEstimated } from '@/components/soil/SoilEvidence';
import { SoilRecordView } from '@/components/soil/SoilRecordView';

const TOP = '0-5cm';

/** Satellite (soil-map) tab: fetch state, then the estimate as pictures, with the technical detail folded away. */
export function SoilFetchPanel({ state, savedEstimate = null, requesting, error, onFetch, onSpeak, isSpeaking }: {
  state: SoilState; savedEstimate?: SoilRow | null; requesting: boolean; error: string | null; onFetch: () => void;
  onSpeak?: (text: string) => void; isSpeaking?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { model, job } = state;
  const active = job?.status === 'queued' || job?.status === 'running';
  const configurationBlocked = !state.engine_available && (state.engine_status === 'SOURCE_NOT_CONFIGURED' || state.engine_status === 'QUEUE_UNAVAILABLE');
  const stale = state.boundary_changed || state.source_changed || (!!model && Date.parse(model.expires_at) < Date.now());
  const top = (key: string) => model?.properties[key]?.[TOP]?.mean ?? null;
  const ratings = state.ratings;
  const readings = model ? {
    ph: readSoil('ph', top('phh2o'), ratings, 'satellite'),
    oc: readSoil('organic_carbon', top('soc'), ratings, 'satellite'),
    n: readSoil('available_nitrogen', null, ratings, 'satellite'),
    p: readSoil('available_phosphorus', null, ratings, 'satellite'),
    k: readSoil('available_potassium', null, ratings, 'satellite'),
  } : savedEstimate ? {
    ph: readSoil('ph', savedEstimate.ph_level, ratings, 'satellite'),
    oc: readSoil('organic_carbon', savedEstimate.organic_carbon, ratings, 'satellite'),
    n: readSoil('available_nitrogen', null, ratings, 'satellite'),
    p: readSoil('available_phosphorus', null, ratings, 'satellite'),
    k: readSoil('available_potassium', null, ratings, 'satellite'),
  } : null;
  const shares = model ? textureShares(top('sand'), top('silt'), top('clay')) : null;

  const action = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="min-h-12 rounded-2xl px-5" variant={model && !stale ? 'outline' : 'default'} onClick={onFetch} disabled={requesting || active || configurationBlocked}>
          {requesting || active ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : model ? <RefreshCw className="mr-2 h-4 w-4" /> : <ScanLine className="mr-2 h-4 w-4" />}
          {t(active ? 'soil.processing' : requesting ? 'soil.starting' : model ? 'soil.checkSoil' : 'soil.getSoil')}
        </Button>
        {model && !stale && !active && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" />{t('soil.cachedHelp')}</span>}
      </div>
      {!state.engine_available && !active && <p role="status" className="text-sm text-muted-foreground">{t(state.engine_status === 'SOURCE_NOT_CONFIGURED' ? 'soil.sourceNotConfigured' : state.engine_status === 'QUEUE_UNAVAILABLE' ? 'soil.queueUnavailable' : 'soil.engineOffline')}</p>}
      {state.engine_available && state.dispatch_mode === 'scheduled' && !active && <p role="status" className="text-sm text-muted-foreground">{t('soil.scheduledDispatch')}</p>}
      {(error || job?.status === 'failed') && <p role="alert" className="rounded-2xl border border-destructive/20 bg-destructive-soft p-3 text-sm text-destructive">
        {t(error === 'INVALID_BOUNDARY' ? 'soil.invalidBoundary' : error === 'RETRY_LATER' ? 'soil.retryLater' : error === 'ENGINE_NOT_CONFIGURED' ? 'soil.sourceNotConfigured' : error === 'ENGINE_OFFLINE' ? 'soil.engineOffline' : 'soil.fetchFailed')}
      </p>}
      {stale && <p className="text-sm text-muted-foreground">{t('soil.refreshNeeded')}</p>}
    </div>
  );

  return (
    <div className="space-y-4" aria-label={t('soil.report')}>
      <SoilVerdictCard kind="satellite" landName={state.land.name} readings={readings}
        dateLabel={model ? new Date(model.retrieved_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) : null}
        onSpeak={onSpeak ?? (() => undefined)} isSpeaking={!!isSpeaking}>
        {!model && !savedEstimate && <p className="mb-3 text-sm text-muted-foreground">{t('soil.fetchIntro')}</p>}
        {action}
      </SoilVerdictCard>

      {active && (
        <section role="status" aria-live="polite" className="space-y-3 rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex justify-between text-sm font-medium"><span>{t(job?.status === 'queued' ? 'soil.queued' : 'soil.fetchingLayers')}</span><span className="tabular-nums">{job?.progress || 0}%</span></div>
          <Progress value={job?.progress || 0} className="h-2.5" />
          <p className="text-xs text-muted-foreground">{t('soil.canLeave')}</p>
          {job?.status === 'queued' && state.dispatch_mode === 'scheduled' && <p className="text-xs text-muted-foreground">{t('soil.scheduledQueueHelp')}</p>}
        </section>
      )}

      {!model && savedEstimate && (
        <SoilRecordView row={savedEstimate} kind="satellite" landName={state.land.name} ratings={ratings} hero={false} />
      )}

      {!model && !savedEstimate && (
        <ol className="space-y-2">
          {([[MapPin, 'soil.stepBoundary'], [ScanLine, 'soil.stepFetch'], [Database, 'soil.stepSave']] as const).map(([Icon, label], i) => (
            <motion.li key={label} initial={{ opacity: 0, x: reduceMotion ? 0 : -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : i * 0.08 }}
              className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10"><Icon className="h-5 w-5 text-primary" /></span>
              <span className="text-sm font-medium text-foreground">{t(label)}</span>
              <span className="ml-auto text-xs font-semibold text-muted-foreground">{i + 1}</span>
            </motion.li>
          ))}
        </ol>
      )}

      {model && readings && (
        <>
          {model.quality === 'partial' && <p role="status" className="rounded-2xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning-foreground">{t('soil.partialHelp')}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SoilReadingCard icon={Droplets} title={t('soil.ph')} reading={readings.ph} scale="ph" />
            <SoilReadingCard icon={Leaf} title={t('soil.organicCarbon')} reading={readings.oc} unit="%" scale="banded" digits={2} />
          </div>
          <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">{t('soil.primaryNutrients')}</h2>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">{t('soil.npkSatelliteHelp')}</p>
            <NutrientTrio lockedLabel={t('soil.needsLab')} readings={[
              { letter: 'N', name: t('soil.nutrientName.n'), reading: readings.n, unit: 'kg/ha' },
              { letter: 'P', name: t('soil.nutrientName.p'), reading: readings.p, unit: 'kg/ha' },
              { letter: 'K', name: t('soil.nutrientName.k'), reading: readings.k, unit: 'kg/ha' },
            ]} />
          </section>
          {shares && (
            <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10"><Shapes className="h-4 w-4 text-primary" /></span>{t('soil.composition')}
              </h2>
              <TextureBar shares={shares} />
            </section>
          )}
          <SoilDepthProfile model={model} />
          <SoilAllValues rows={[
            { key: 'nitrogen', label: t('soil.totalNitrogen'), value: soilNumber(top('nitrogen')), unit: 'g/kg' },
            { key: 'cec', label: t('soil.cec'), value: soilNumber(top('cec')), unit: 'cmol(+)/kg', digits: 1 },
            { key: 'bdod', label: t('soil.bulkDensity'), value: soilNumber(top('bdod')), unit: 'g/cm³' },
            { key: 'sand', label: t('soil.sand'), value: soilNumber(top('sand')), unit: '%', digits: 1 },
            { key: 'silt', label: t('soil.silt'), value: soilNumber(top('silt')), unit: '%', digits: 1 },
            { key: 'clay', label: t('soil.clay'), value: soilNumber(top('clay')), unit: '%', digits: 1 },
          ]} />
          <SoilHowEstimated model={model} />
        </>
      )}
    </div>
  );
}
