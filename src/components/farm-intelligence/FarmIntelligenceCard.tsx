import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLandEnvState, useLandEnvTimeline } from '@/hooks/useFarmIntelligence';
import { IrrigationGauge } from './IrrigationGauge';
import { SprayWindowStrip } from './SprayWindowStrip';
import { RiskEpisodeChips } from './RiskEpisodeChips';
import { EtoRainMiniTimeline } from './EtoRainMiniTimeline';

/**
 * Farm Intelligence card — additive surface on the Land Detail screen.
 * Renders nothing when the environmental spine has no state for this land.
 */
export function FarmIntelligenceCard({ landId }: { landId: string }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useLandEnvState(landId);
  const timeline = useLandEnvTimeline(landId, ['ET0', 'RAIN'], 7, 5);

  if (isLoading) {
    return <div className="h-56 animate-pulse rounded-2xl bg-muted" />;
  }
  if (isError || !data || (!data.state && data.active_episodes.length === 0)) {
    return null;
  }

  const s = data.state ?? {};

  return (
    <Card className="border-border/50 shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Sparkles className="h-5 w-5 text-primary" />
          {t('farmIntel.title')}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t('farmIntel.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <IrrigationGauge
          depletionMm={s.root_depletion_mm}
          rawMm={s.raw_mm}
          tawMm={s.taw_mm}
          etcMm={s.etc_mm}
        />
        <SprayWindowStrip window={s.spray_window} score={s.spray_score} />
        <RiskEpisodeChips landId={landId} episodes={data.active_episodes} />
        <EtoRainMiniTimeline series={timeline.data?.series} isLoading={timeline.isLoading} />
      </CardContent>
    </Card>
  );
}
