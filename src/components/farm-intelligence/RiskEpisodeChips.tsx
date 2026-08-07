import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, ChevronRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { envIntelligenceApi, type RiskEpisode, type LineageNode } from '@/services/envIntelligenceApi';
import { useObservationLineage } from '@/hooks/useFarmIntelligence';

interface RiskEpisodeChipsProps {
  landId: string;
  episodes: RiskEpisode[];
}

const PHASE_STYLE: Record<string, string> = {
  onset: 'bg-warning/15 text-warning border-warning/30',
  active: 'bg-destructive/15 text-destructive border-destructive/30',
  peak: 'bg-destructive/20 text-destructive border-destructive/40',
  declining: 'bg-muted text-muted-foreground border-border',
};

export function RiskEpisodeChips({ landId, episodes }: RiskEpisodeChipsProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<RiskEpisode | null>(null);

  if (!episodes.length) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-sm text-muted-foreground">{t('farmIntel.risk.none')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <span className="text-sm font-semibold text-foreground">{t('farmIntel.risk.title')}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {episodes.map((ep) => (
          <button
            key={ep.episode_id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelected(ep);
            }}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
              PHASE_STYLE[ep.phase] ?? 'bg-muted text-muted-foreground border-border'
            }`}
          >
            <span>{t(`farmIntel.risk.codes.${ep.risk_code}`, { defaultValue: ep.risk_code })}</span>
            <span className="opacity-70">·</span>
            <span>{t(`farmIntel.risk.phase.${ep.phase}`, { defaultValue: ep.phase })}</span>
            <Info className="h-3 w-3" />
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">{t('farmIntel.risk.tap_hint')}</p>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto bg-background">
          {selected && <WhySheet landId={landId} episode={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function WhySheet({ landId, episode }: { landId: string; episode: RiskEpisode }) {
  const { t } = useTranslation();
  const [lineageObsId, setLineageObsId] = useState<number | undefined>();

  const { data: obs, isLoading } = useQuery({
    queryKey: ['env-intel', 'why', landId],
    queryFn: () =>
      envIntelligenceApi.getObservations({
        landId,
        from: new Date(Date.now() - 2 * 86400000).toISOString(),
        kind: 'measured',
      }),
    staleTime: 15 * 60 * 1000,
  });

  const { data: lineage } = useObservationLineage(lineageObsId, !!lineageObsId);

  const factors = (obs?.points ?? []).slice(-8).reverse();

  return (
    <>
      <SheetHeader className="text-left">
        <SheetTitle className="flex items-center gap-2">
          {t(`farmIntel.risk.codes.${episode.risk_code}`, { defaultValue: episode.risk_code })}
          <Badge variant="outline">
            {t(`farmIntel.risk.phase.${episode.phase}`, { defaultValue: episode.phase })}
          </Badge>
        </SheetTitle>
        <SheetDescription>{t('farmIntel.risk.why_desc')}</SheetDescription>
      </SheetHeader>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label={t('farmIntel.risk.current')} value={fmt(episode.current_value)} />
        <Stat label={t('farmIntel.risk.peak')} value={fmt(episode.peak_value)} />
        <Stat
          label={t('farmIntel.risk.confidence')}
          value={episode.confidence != null ? `${Math.round(episode.confidence * 100)}%` : '—'}
        />
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-sm font-semibold text-foreground">{t('farmIntel.risk.factors')}</p>
        {isLoading && <p className="text-sm text-muted-foreground">{t('farmIntel.loading')}</p>}
        {!isLoading && factors.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('farmIntel.no_data')}</p>
        )}
        {factors.map((p) => (
          <button
            key={p.obs_id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLineageObsId(p.obs_id === lineageObsId ? undefined : p.obs_id);
            }}
            className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-left"
          >
            <span className="text-sm text-foreground">{p.display_name}</span>
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {p.value != null ? `${p.value.toFixed(1)}${p.unit ? ` ${p.unit}` : ''}` : '—'}
              <ChevronRight className="h-4 w-4" />
            </span>
          </button>
        ))}
      </div>

      {lineage?.tree && (
        <div className="mt-4 rounded-lg border border-border/60 p-3">
          <p className="mb-2 text-sm font-semibold text-foreground">{t('farmIntel.risk.how_computed')}</p>
          <LineageTree node={lineage.tree} depth={0} />
        </div>
      )}
    </>
  );
}

function LineageTree({ node, depth }: { node: LineageNode; depth: number }) {
  return (
    <div style={{ paddingLeft: depth * 12 }} className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-foreground">{node.display_name}</span>
        <span className="text-xs text-muted-foreground">
          {node.value != null ? `${node.value.toFixed(2)}${node.unit ? ` ${node.unit}` : ''}` : '—'}
        </span>
      </div>
      {node.method && (
        <p className="text-[11px] text-muted-foreground">
          {node.method.label}
          {node.method.authoritative_source ? ` · ${node.method.authoritative_source}` : ''}
        </p>
      )}
      {node.inputs?.map((child) => (
        <LineageTree key={child.obs_id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

const fmt = (v: number | null) => (v == null ? '—' : Number(v).toFixed(1));
