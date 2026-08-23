import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { envIntelligenceApi } from '@/services/envIntelligenceApi';
import { ShieldAlert, FlaskConical, Activity, Thermometer } from 'lucide-react';

export default function EnvDiagnostics() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [landId, setLandId] = useState<string>('');

  // ── Role gate (server-side table, never local storage) ────────────────────
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['env-diag', 'roles', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', user!.id);
      return (data ?? []).map((r) => String(r.role));
    },
    enabled: !!user?.id,
  });

  const allowed = useMemo(
    () => (roles ?? []).some((r) => ['super_admin', 'tenant_admin', 'tenant_manager'].includes(r)),
    [roles],
  );

  const { data: lands } = useQuery({
    queryKey: ['env-diag', 'lands', user?.tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('lands')
        .select('id, name')
        .eq('tenant_id', user!.tenantId)
        .limit(200);
      return data ?? [];
    },
    enabled: allowed && !!user?.tenantId,
  });

  const { data: stateRow } = useQuery({
    queryKey: ['env-diag', 'state', landId],
    queryFn: async () => {
      const { data } = await supabase
        .from('land_weather_state')
        .select('cell_key, metric_date, confidence, et0_method')
        .eq('land_id', landId)
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: allowed && !!landId,
  });

  const cellKey = stateRow?.cell_key ?? '';

  const { data: observations } = useQuery({
    queryKey: ['env-diag', 'obs', landId],
    queryFn: () =>
      envIntelligenceApi.getObservations({
        landId,
        from: new Date(Date.now() - 3 * 86400000).toISOString(),
      }),
    enabled: allowed && !!landId,
  });

  const { data: bias } = useQuery({
    queryKey: ['env-diag', 'bias', cellKey],
    queryFn: async () => {
      const { data } = await supabase
        .from('weather_cell_bias')
        .select('property_code, source_id, rolling_bias, rolling_mae, sample_n, updated_at')
        .eq('cell_key', cellKey)
        .order('updated_at', { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: allowed && !!cellKey,
  });

  const { data: methods } = useQuery({
    queryKey: ['env-diag', 'methods'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sci_method_registry')
        .select('method_id, version, method_kind, authoritative_source, review_status, valid_from')
        .order('method_id', { ascending: true })
        .limit(100);
      return data ?? [];
    },
    enabled: allowed,
  });

  const { data: runs } = useQuery({
    queryKey: ['env-diag', 'runs', landId],
    queryFn: async () => {
      const { data } = await supabase
        .from('env_derivation_run')
        .select('run_id, method_id, method_version, executed_at, status, cell_key')
        .eq('land_id', landId)
        .order('executed_at', { ascending: false })
        .limit(25);
      return data ?? [];
    },
    enabled: allowed && !!landId,
  });

  // ── FIX I (2026-08-23): GDD pipeline telemetry ────────────────────────────
  const { data: gddHealth } = useQuery({
    queryKey: ['env-diag', 'gdd-health'],
    queryFn: async () => {
      const { data } = await supabase
        .from('v_gdd_pipeline_health')
        .select(
          'land_id, current_crop, gdd_anchor_date, current_gdd, daily_rows, zero_days, latest_obs, last_positive_gdd, has_null_temp_rows, bad_base_temp, health',
        )
        .limit(200);
      return data ?? [];
    },
    enabled: allowed,
  });

  const { data: gddSeries } = useQuery({
    queryKey: ['env-diag', 'gdd-series', landId],
    queryFn: async () => {
      const { data } = await supabase
        .from('land_gdd_daily')
        .select('obs_date, daily_gdd, cumulative_gdd, tmax_c, tmin_c, base_temp_c')
        .eq('land_id', landId)
        .order('obs_date', { ascending: false })
        .limit(60);
      return (data ?? []).slice().reverse();
    },
    enabled: allowed && !!landId,
  });

  const landNameById = useMemo(() => {
    const map = new Map<string, string>();
    (lands ?? []).forEach((l: any) => map.set(l.id, l.name));
    return map;
  }, [lands]);


  if (rolesLoading) {
    return <div className="p-4"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('farmIntel.diagnostics.no_access')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      <header>
        <h1 className="text-2xl font-bold text-foreground">{t('farmIntel.diagnostics.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('farmIntel.diagnostics.subtitle')}</p>
      </header>

      <Select value={landId} onValueChange={setLandId}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('farmIntel.diagnostics.select_land')} />
        </SelectTrigger>
        <SelectContent className="bg-popover">
          {(lands ?? []).map((l: any) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {cellKey && (
        <Badge variant="outline">
          {t('farmIntel.diagnostics.cell_key')}: {cellKey}
        </Badge>
      )}

      <Section
        icon={<Activity className="h-4 w-4 text-primary" />}
        title={t('farmIntel.diagnostics.observations')}
      >
        <Table
          head={[
            t('farmIntel.diagnostics.property'),
            t('farmIntel.diagnostics.value'),
            t('farmIntel.diagnostics.time'),
            t('farmIntel.diagnostics.source'),
            t('farmIntel.diagnostics.qc'),
          ]}
          rows={(observations?.points ?? []).slice(-40).reverse().map((p) => [
            p.property,
            p.value != null ? `${p.value.toFixed(2)} ${p.unit ?? ''}` : '—',
            new Date(p.valid_time).toLocaleString(),
            p.source_code ?? p.source_kind ?? '—',
            String(p.qc_level ?? '—'),
          ])}
        />
      </Section>

      <Section
        icon={<Activity className="h-4 w-4 text-warning" />}
        title={t('farmIntel.diagnostics.bias')}
      >
        <Table
          head={[
            t('farmIntel.diagnostics.property'),
            'bias',
            'MAE',
            'n',
            t('farmIntel.diagnostics.time'),
          ]}
          rows={(bias ?? []).map((b: any) => [
            b.property_code,
            b.rolling_bias != null ? Number(b.rolling_bias).toFixed(2) : '—',
            b.rolling_mae != null ? Number(b.rolling_mae).toFixed(2) : '—',
            String(b.sample_n ?? '—'),
            b.updated_at ? new Date(b.updated_at).toLocaleString() : '—',
          ])}
        />
      </Section>

      <Section
        icon={<FlaskConical className="h-4 w-4 text-primary" />}
        title={t('farmIntel.diagnostics.methods')}
      >
        <Table
          head={['method', t('farmIntel.diagnostics.version'), 'kind', 'source', t('farmIntel.diagnostics.status')]}
          rows={(methods ?? []).map((m: any) => [
            m.method_id,
            m.version,
            m.method_kind ?? '—',
            m.authoritative_source ?? '—',
            m.review_status ?? '—',
          ])}
        />
      </Section>

      <Section
        icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        title={t('farmIntel.diagnostics.runs')}
      >
        <Table
          head={['method', t('farmIntel.diagnostics.version'), t('farmIntel.diagnostics.time'), t('farmIntel.diagnostics.status')]}
          rows={(runs ?? []).map((r: any) => [
            r.method_id,
            r.method_version,
            r.executed_at ? new Date(r.executed_at).toLocaleString() : '—',
            r.status ?? '—',
          ])}
        />
      </Section>

      <Section
        icon={<Thermometer className="h-4 w-4 text-primary" />}
        title="GDD pipeline health"
      >
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              {['land', 'crop', 'anchor', 'cum GDD', 'days', 'zero days', 'latest obs', 'health'].map((h) => (
                <th key={h} className="whitespace-nowrap py-1 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(gddHealth ?? []).map((g: any) => {
              const bad = g.health !== 'OK';
              return (
                <tr
                  key={g.land_id}
                  className={`cursor-pointer border-t border-border/40 ${bad ? 'bg-destructive/10' : ''}`}
                  onClick={() => setLandId(g.land_id)}
                >
                  <td className="whitespace-nowrap py-1 pr-3 text-foreground">
                    {landNameById.get(g.land_id) ?? String(g.land_id).slice(0, 8)}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-3 text-foreground">{g.current_crop ?? '—'}</td>
                  <td className="whitespace-nowrap py-1 pr-3 text-foreground">{g.gdd_anchor_date ?? '—'}</td>
                  <td className="whitespace-nowrap py-1 pr-3 text-foreground">
                    {g.current_gdd != null ? Number(g.current_gdd).toFixed(0) : '—'}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-3 text-foreground">{g.daily_rows ?? 0}</td>
                  <td className="whitespace-nowrap py-1 pr-3 text-foreground">{g.zero_days ?? 0}</td>
                  <td className="whitespace-nowrap py-1 pr-3 text-foreground">{g.latest_obs ?? '—'}</td>
                  <td className="whitespace-nowrap py-1 pr-3">
                    <Badge variant={bad ? 'destructive' : 'outline'}>{g.health ?? '—'}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!(gddHealth ?? []).length && <p className="text-sm text-muted-foreground">—</p>}
      </Section>

      {!!landId && (
        <Section
          icon={<Thermometer className="h-4 w-4 text-warning" />}
          title="Daily GDD (last 60 days)"
        >
          <GddSparkline series={(gddSeries ?? []) as any[]} />
          <Table
            head={['date', 'tmax', 'tmin', 'base', 'daily', 'cumulative']}
            rows={(gddSeries ?? [])
              .slice()
              .reverse()
              .slice(0, 14)
              .map((d: any) => [
                String(d.obs_date),
                d.tmax_c != null ? Number(d.tmax_c).toFixed(1) : '—',
                d.tmin_c != null ? Number(d.tmin_c).toFixed(1) : '—',
                d.base_temp_c != null ? Number(d.base_temp_c).toFixed(1) : '—',
                d.daily_gdd != null ? Number(d.daily_gdd).toFixed(2) : '—',
                d.cumulative_gdd != null ? Number(d.cumulative_gdd).toFixed(0) : '—',
              ])}
          />
        </Section>
      )}
    </div>
  );
}

function GddSparkline({ series }: { series: any[] }) {
  const points = series.filter((d) => d?.daily_gdd != null);
  if (points.length < 2) {
    return <p className="mb-2 text-sm text-muted-foreground">—</p>;
  }
  const values = points.map((d) => Number(d.daily_gdd));
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 28;
  const path = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ');
  return (
    <div className="mb-3">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full">
        <polyline
          points={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          className="text-primary"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="text-[10px] text-muted-foreground">
        max {max.toFixed(1)} °Cd/day · {values.length} days
      </p>
    </div>
  );
}


function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">—</p>;
  }
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-muted-foreground">
          {head.map((h) => (
            <th key={h} className="whitespace-nowrap py-1 pr-3 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border/40">
            {r.map((c, j) => (
              <td key={j} className="whitespace-nowrap py-1 pr-3 text-foreground">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
