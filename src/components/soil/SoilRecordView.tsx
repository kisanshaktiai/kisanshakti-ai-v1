import { useTranslation } from 'react-i18next';
import { Droplets, Leaf, Shapes } from 'lucide-react';
import { soilNumber, type SoilRating, type SoilRow, type SoilSourceKey } from '@/services/soil/soilReport';
import { readSoil, textureShares } from '@/lib/soilInterpretation';
import { SoilVerdictCard } from '@/components/soil/SoilVerdictCard';
import { SoilReadingCard, NutrientTrio, TextureBar } from '@/components/soil/SoilVisuals';
import { SoilAllValues } from '@/components/soil/SoilEvidence';

/** One saved soil record (lab test, soil device, or a saved satellite estimate), as stored — nothing defaulted. */
export function SoilRecordView({ row, kind, landName, ratings, onSpeak, isSpeaking, hero = true }: {
  row: SoilRow; kind: SoilSourceKey; landName: string; ratings?: SoilRating[];
  /** false when the caller already shows the summary card for this record */
  hero?: boolean;
  onSpeak?: (text: string) => void; isSpeaking?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const readings = {
    ph: readSoil('ph', row.ph_level, ratings, kind),
    oc: readSoil('organic_carbon', row.organic_carbon, ratings, kind),
    n: readSoil('available_nitrogen', kind === 'satellite' ? null : row.nitrogen_kg_per_ha, ratings, kind),
    p: readSoil('available_phosphorus', kind === 'satellite' ? null : row.phosphorus_kg_per_ha, ratings, kind),
    k: readSoil('available_potassium', kind === 'satellite' ? null : row.potassium_kg_per_ha, ratings, kind),
  };
  const shares = textureShares(row.sand_percent, row.silt_percent, row.clay_percent);
  const date = row.test_date ? new Date(row.test_date).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <div className="space-y-4">
      {hero ? (
        <SoilVerdictCard kind={kind} landName={landName} dateLabel={date} readings={readings} onSpeak={onSpeak ?? (() => undefined)} isSpeaking={!!isSpeaking}>
          {kind === 'satellite' && <p className="text-sm text-muted-foreground" role="note">{t('soil.modelledNotice')}</p>}
        </SoilVerdictCard>
      ) : kind === 'satellite' && <p className="text-sm text-muted-foreground" role="note">{t('soil.modelledNotice')}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SoilReadingCard icon={Droplets} title={t('soil.ph')} reading={readings.ph} scale="ph" help={row.ph_text} />
        <SoilReadingCard icon={Leaf} title={t('soil.organicCarbon')} reading={readings.oc} unit="%" scale="banded" digits={2} help={row.organic_carbon_text} />
      </div>

      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">{t('soil.primaryNutrients')}</h2>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">{t(kind === 'satellite' ? 'soil.npkSatelliteHelp' : 'soil.npkHelp')}</p>
        <NutrientTrio lockedLabel={t(kind === 'satellite' ? 'soil.needsLab' : 'soil.notInReport')} readings={[
          { letter: 'N', name: t('soil.nutrientName.n'), reading: readings.n, unit: 'kg/ha' },
          { letter: 'P', name: t('soil.nutrientName.p'), reading: readings.p, unit: 'kg/ha' },
          { letter: 'K', name: t('soil.nutrientName.k'), reading: readings.k, unit: 'kg/ha' },
        ]} />
      </section>

      {(shares || row.texture) && (
        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10"><Shapes className="h-4 w-4 text-primary" /></span>{t('soil.composition')}
          </h2>
          {row.texture && <p className="mb-3 text-sm font-semibold text-foreground">{t('soil.texture')}: {row.texture}</p>}
          {shares && <TextureBar shares={shares} />}
        </section>
      )}

      <SoilAllValues rows={[
        { key: 'cec', label: t('soil.cec'), value: soilNumber(row.cec), unit: 'cmol(+)/kg', digits: 1 },
        { key: 'bulk', label: t('soil.bulkDensity'), value: soilNumber(row.bulk_density), unit: 'g/cm³' },
        { key: 'sand', label: t('soil.sand'), value: soilNumber(row.sand_percent), unit: '%', digits: 1 },
        { key: 'silt', label: t('soil.silt'), value: soilNumber(row.silt_percent), unit: '%', digits: 1 },
        { key: 'clay', label: t('soil.clay'), value: soilNumber(row.clay_percent), unit: '%', digits: 1 },
        { key: 'nTotal', label: `${t('soil.nutrientName.n')} · ${t('soil.totalKg')}`, value: soilNumber(row.nitrogen_total_kg), unit: 'kg', digits: 0 },
        { key: 'pTotal', label: `${t('soil.nutrientName.p')} · ${t('soil.totalKg')}`, value: soilNumber(row.phosphorus_total_kg), unit: 'kg', digits: 0 },
        { key: 'kTotal', label: `${t('soil.nutrientName.k')} · ${t('soil.totalKg')}`, value: soilNumber(row.potassium_total_kg), unit: 'kg', digits: 0 },
        { key: 'completeness', label: t('soil.completeness'), value: soilNumber(row.data_completeness), unit: '%', digits: 0 },
      ]} />

      {row.note && <p className="rounded-3xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground"><span className="font-semibold text-foreground">{t('soil.notes')}: </span>{row.note}</p>}
    </div>
  );
}
