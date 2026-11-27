import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cloud, CloudRain, Sun, Wind, Droplets, Eye, Gauge, Thermometer, CloudSnow, CloudLightning, CloudDrizzle,
  Sunrise, Sunset, AlertTriangle, RefreshCw, MapPin, Satellite, Umbrella, Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VoiceWeatherSummary } from '@/components/weather/VoiceWeatherSummary';
import { FarmingRecommendations } from '@/components/weather/FarmingRecommendations';
import { PageShell } from '@/components/layout/PageShell';
import { useWeather } from '@/hooks/useWeather';
import { useLands } from '@/hooks/useLands';
import { useLandWeatherState } from '@/hooks/useLandWeatherState';
import { LandAgronomyPanel } from '@/components/weather/LandAgronomyPanel';
import { toastManager } from '@/utils/ToastManager';
import { WeatherSkeleton } from '@/components/skeletons';
import { PullRefreshController } from '@/components/weather/PullRefreshController';
import { SevenDayForecast } from '@/components/weather/SevenDayForecast';
import '@/living/living.css';

/**
 * Weather in the Living Farm look. The data calls are the ones this page always made
 * (`useWeather`, `useLands`, `useLandWeatherState`); only the drawing changed:
 * no moving background, no blur, no chart library, sizes from the shared fluid scale.
 */
const card = 'rounded-[var(--lf-r)] border border-border bg-card shadow-sm';
const pad = { padding: 'clamp(12px, 3.6vw, 18px)' } as const;
const gut = { padding: '0 var(--lf-gut)' } as const;

export default function Weather() {
  const { t, i18n } = useTranslation();
  const numLocale = `${i18n.language || 'en'}-u-nu-latn`;
  const {
    currentWeather, forecast, hourlyForecast, loading, error, refetch, lastUpdated,
    locationSource, regionalFallbackLabel, weatherDistanceKm, weatherStationName, isStale,
  } = useWeather();

  // MODEL B — land-scoped agronomy. Display weather may borrow a nearby cell;
  // irrigation/GDD/disease never may, so they are keyed to one selected land.
  const { lands } = useLands();
  const [selectedLandId, setSelectedLandId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedLandId && lands?.length) setSelectedLandId(lands[0].id);
  }, [lands, selectedLandId]);
  const { state: landState, isToday: landStateIsToday, isLoading: landStateLoading } =
    useLandWeatherState(selectedLandId);
  const selectedLand = lands?.find((l: any) => l.id === selectedLandId);

  
  /**
   * FIX: Removed problematic useEffect with touch listeners
   * ROOT CAUSE: useEffect dependencies [startY, pullDistance] caused constant re-runs,
   * re-attaching listeners and triggering multiple refresh calls
   * SOLUTION: Use PullRefreshController component instead
   */

  // Manual refresh function with toast deduplication
  const handleManualSync = async () => {
    try {
      await refetch();
      toastManager.success(t('weather.toast.sync_success'), 'weather-sync-success');
    } catch (err) {
      toastManager.error(t('weather.toast.sync_error'), 'weather-sync-error');
      throw err; // Re-throw for PullRefreshController to handle
    }
  };


  const getWeatherIcon = (condition: string) => {
    const iconMap: Record<string, LucideIcon> = {
      Clear: Sun, Clouds: Cloud, Rain: CloudRain, Drizzle: CloudDrizzle, Thunderstorm: CloudLightning, Snow: CloudSnow, Mist: Cloud, Fog: Cloud,
    };
    return iconMap[condition] || Cloud;
  };

  const getStatColor = (type: string, value: number) => {
    switch(type) {
      case 'humidity':
        return value > 70 ? 'text-info' : value > 40 ? 'text-info' : 'text-foreground/80';
      case 'wind':
        return value > 20 ? 'text-warning' : value > 10 ? 'text-warning' : 'text-success';
      case 'visibility':
        return value < 2 ? 'text-destructive' : value < 5 ? 'text-warning' : 'text-success';
      case 'pressure':
        return value < 1000 ? 'text-info' : value > 1020 ? 'text-destructive' : 'text-success';
      default:
        return 'text-muted-foreground';
    }
  };

  if (loading) {
    return <WeatherSkeleton />;
  }

  if (error || !currentWeather) {
    return (
      <PageShell variant="plain" className="flex items-center justify-center">
        <div className={`${card} flex w-full max-w-md flex-col gap-3`} style={pad} role="alert">
          <h1 className="lf-head flex items-center gap-2 text-destructive"><AlertTriangle size={22} aria-hidden />{t('weather.error.title')}</h1>
          <p className="lf-lab font-normal text-muted-foreground">{error || t('weather.error.message')}</p>
          <button type="button" onClick={() => { void handleManualSync().catch(() => undefined); }} className="flex items-center justify-center gap-2 rounded-full bg-primary font-bold text-primary-foreground" style={{ minHeight: 'var(--lf-tap)', fontSize: 'var(--lf-fs-lab)' }}>
            <RefreshCw size={20} aria-hidden />{t('weather.error.retry')}
          </button>
        </div>
      </PageShell>
    );
  }

  // A farmer must be able to tell his own field from a borrowed reading.
  const provenance = (() => {
    if (locationSource === 'regional') return { label: regionalFallbackLabel || t('weather.provenance.regional'), tone: 'bg-warning/15 text-warning' };
    if (weatherDistanceKm !== null && weatherDistanceKm !== undefined && weatherDistanceKm > 0.5) {
      return {
        label: weatherStationName ? t('weather.provenance.named_station', { name: weatherStationName, km: weatherDistanceKm }) : t('weather.provenance.nearby_station', { km: weatherDistanceKm }),
        tone: 'bg-info/15 text-info',
      };
    }
    if (locationSource === 'farm') return { label: t('weather.provenance.your_field'), tone: 'bg-success/15 text-success' };
    if (locationSource === 'gps') return { label: t('weather.provenance.your_location'), tone: 'bg-success/15 text-success' };
    return null;
  })();

  const updatedText = (() => {
    if (!lastUpdated) return null;
    const minutes = Math.round((Date.now() - lastUpdated) / 60000);
    if (minutes < 1) return t('weather.header.updated_now');
    if (minutes < 60) return t('weather.header.updated_minutes', { minutes });
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? t('weather.header.updated_hour') : t('weather.header.updated_hours', { hours });
  })();

  const clock = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString(numLocale, { hour: 'numeric', minute: '2-digit' });
  const HeroIcon = getWeatherIcon(currentWeather.main);

  const week = forecast.slice(0, 7);
  const weekRain = week.reduce((sum, day) => sum + (day.rain || 0), 0);
  const maxRain = Math.max(...week.map((day) => day.rain || 0), 0);
  const hours = (hourlyForecast || []).slice(0, 12);

  const uv = currentWeather.uv_index;
  const uvTone = uv !== undefined && uv > 7 ? 'text-destructive' : uv !== undefined && uv > 3 ? 'text-warning' : 'text-success';
  const windKmh = Math.round(currentWeather.wind_speed * 3.6);
  const visibilityKm = (currentWeather.visibility / 1000).toFixed(1);
  const stats: Array<{ key: string; icon: LucideIcon; label: string; value: string; unit: string; tone: string }> = [
    { key: 'wind', icon: Wind, label: t('weather.stats.wind'), value: String(windKmh), unit: t('weather.units.kmh'), tone: getStatColor('wind', windKmh) },
    { key: 'humidity', icon: Droplets, label: t('weather.stats.humidity'), value: String(currentWeather.humidity), unit: t('weather.units.percent'), tone: getStatColor('humidity', currentWeather.humidity) },
    { key: 'visibility', icon: Eye, label: t('weather.stats.visibility'), value: visibilityKm, unit: t('weather.units.km'), tone: getStatColor('visibility', Number(visibilityKm)) },
    { key: 'pressure', icon: Gauge, label: t('weather.stats.pressure'), value: String(currentWeather.pressure), unit: t('weather.units.hpa'), tone: 'text-foreground' },
    { key: 'uv', icon: Sun, label: t('weather.stats.uv'), value: uv !== undefined ? uv.toFixed(1) : '--', unit: '', tone: uvTone },
    { key: 'dew', icon: Thermometer, label: t('weather.stats.dew_point'), value: currentWeather.dew_point !== undefined ? `${Math.round(currentWeather.dew_point)}°` : '--', unit: '', tone: 'text-success' },
  ];

  return (
    <PageShell variant="plain" padding="none" spacing="none">
      {/* PullRefreshController inherits the global scroll container — no nested scroller. */}
      <PullRefreshController onRefresh={handleManualSync} threshold={80}>
        <div className="flex flex-col gap-3 pb-4" style={{ fontSize: 'var(--lf-fs-body)', lineHeight: 1.55 }}>
          {/* Now: where the reading is from, then the reading */}
          <section aria-label={t('weather.aria.hero_card')} style={{ padding: '12px var(--lf-gut) 0', background: 'linear-gradient(to bottom, hsl(var(--info) / 0.18), hsl(var(--info) / 0))' }}>
            <div className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <h1 className="lf-head flex items-center gap-1.5"><MapPin size={20} className="shrink-0 text-primary" aria-hidden /><span className="min-w-0 truncate">{currentWeather.location || t('weather.header.current_location')}</span></h1>
                <div className="flex flex-wrap items-center gap-1.5">
                  {provenance && <span className={`lf-pill lf-pill-sm ${provenance.tone}`}><Satellite size={14} aria-hidden />{provenance.label}</span>}
                  {isStale && <span className="lf-pill lf-pill-sm bg-warning/15 text-warning"><AlertTriangle size={14} aria-hidden />{t('weather.provenance.stale')}</span>}
                </div>
                <p className="lf-cap text-muted-foreground">
                  {new Date().toLocaleDateString(numLocale, { weekday: 'short', day: 'numeric', month: 'short' })}
                  {updatedText && <> · {t('weather.header.updated_prefix')} {updatedText}</>}
                </p>
              </div>
              <button type="button" onClick={() => { void handleManualSync().catch(() => undefined); }} aria-label={t('weather.aria.refresh_button')} className="lf-round border border-border bg-card text-foreground">
                <RefreshCw size={22} aria-hidden />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-start gap-1">
                  <span className="lf-stat" style={{ fontSize: 'clamp(64px, 21vw, 104px)' }}>{Math.round(currentWeather.temp)}</span>
                  <span className="lf-head mt-2 text-muted-foreground">{t('weather.units.celsius')}</span>
                </div>
                <p className="lf-head mt-1 capitalize" style={{ overflowWrap: 'anywhere' }}>{currentWeather.description}</p>
                <p className="lf-lab mt-0.5 flex items-center gap-1 font-normal text-muted-foreground"><Thermometer size={16} aria-hidden />{t('weather.hero.feels_like', { temp: Math.round(currentWeather.feels_like) })}</p>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-2">
                <span className="grid place-items-center rounded-[32%] bg-card text-primary shadow-sm" style={{ width: 'clamp(72px, 22vw, 104px)', height: 'clamp(72px, 22vw, 104px)' }}><HeroIcon style={{ width: '55%', height: '55%' }} aria-hidden /></span>
                {currentWeather.provider && <span className="lf-cap text-muted-foreground">{currentWeather.provider}</span>}
              </div>
            </div>

            {(currentWeather.sunrise || currentWeather.sunset) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {currentWeather.sunrise && <span className="lf-pill lf-pill-sm bg-warning/15 text-foreground"><Sunrise size={16} className="text-warning" aria-hidden />{clock(currentWeather.sunrise)}</span>}
                {currentWeather.sunset && <span className="lf-pill lf-pill-sm bg-primary/10 text-foreground"><Sunset size={16} className="text-primary" aria-hidden />{clock(currentWeather.sunset)}</span>}
              </div>
            )}
          </section>

          <div style={gut}><VoiceWeatherSummary currentWeather={currentWeather} forecast={forecast} className="w-full" /></div>

          {/* Land selector — only meaningful when the farmer has multiple fields */}
          {lands && lands.length > 1 && (
            <div style={gut}>
              <Select value={selectedLandId} onValueChange={setSelectedLandId}>
                <SelectTrigger className="rounded-full text-base" style={{ minHeight: 'var(--lf-tap)' }}>
                  <SelectValue placeholder={t('weather.field.select')} />
                </SelectTrigger>
                <SelectContent>
                  {lands.map((l: any) => (
                    <SelectItem key={l.id} value={l.id} className="py-3 text-base">
                      {l.name}{l.area_acres ? ` · ${l.area_acres} ac` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* MODEL B — DB-derived field intelligence */}
          {selectedLandId && (
            <LandAgronomyPanel state={landState} landName={selectedLand?.name} isToday={landStateIsToday} isLoading={landStateLoading} />
          )}

          <section aria-label={t('weather.aria.stats_grid')} className="lf-grid3" style={gut}>
            {stats.map((stat) => (
              <div key={stat.key} className={`${card} flex min-w-0 flex-col items-center gap-0.5 text-center`} style={{ padding: 'clamp(8px, 2.6vw, 14px) 4px' }}>
                <stat.icon size={22} className={stat.tone} aria-hidden />
                <span className={`lf-head ${stat.tone}`} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{stat.value}{stat.unit && <span className="lf-cap ms-0.5 text-muted-foreground">{stat.unit}</span>}</span>
                <span className="lf-cap w-full truncate text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </section>

          <FarmingRecommendations currentWeather={currentWeather} forecast={forecast} landState={landStateIsToday ? landState : null} />

          {hours.length > 0 && (
            <section style={gut} aria-label={t('weather.aria.hourly_chart')}>
              <div className={card} style={pad}>
                <h2 className="lf-head flex items-center gap-2"><Clock size={20} className="text-primary" aria-hidden />{t('weather.hourly.title')}</h2>
                <ul className="mt-2 flex gap-1 overflow-x-auto pb-1">
                  {hours.map((hour, index) => {
                    const chance = Math.round((hour.pop || 0) * 100);
                    return (
                      <li key={hour.dt} className={`flex shrink-0 flex-col items-center gap-1 rounded-2xl px-2 py-2 ${index === 0 ? 'bg-primary/10' : ''}`} style={{ minWidth: 'clamp(56px, 16vw, 72px)' }}>
                        <span className="lf-cap text-muted-foreground">{index === 0 ? t('weather.hourly.now') : new Date(hour.dt * 1000).toLocaleTimeString(numLocale, { hour: 'numeric' })}</span>
                        <b className="lf-head" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{Math.round(hour.temp)}°</b>
                        <span className="flex h-10 w-2.5 items-end overflow-hidden rounded-full bg-muted" aria-hidden><span className="w-full rounded-full bg-info" style={{ height: `${chance}%` }} /></span>
                        <span className={`lf-cap flex items-center gap-0.5 ${chance > 0 ? 'text-info' : 'text-muted-foreground'}`}><Droplets size={12} aria-hidden /><span className="sr-only">{t('weather.hourly.rain')}</span>{chance}{t('weather.units.percent')}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          )}

          <section style={gut} aria-label={t('weather.aria.rainfall_chart')}>
            <div className={card} style={pad}>
              <h2 className="lf-head flex items-center gap-2"><Umbrella size={20} className="text-primary" aria-hidden />{t('weather.rainfall.title')}</h2>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className="lf-cap text-muted-foreground">{t('weather.rainfall.today')}</p>
                  <p className="lf-head text-primary">{forecast && forecast[0]?.rain ? forecast[0].rain.toFixed(1) : '0.0'} {t('weather.units.mm')}</p>
                </div>
                <div>
                  <p className="lf-cap text-muted-foreground">{t('weather.rainfall.week')}</p>
                  <p className="lf-head text-primary">{weekRain.toFixed(1)} {t('weather.units.mm')}</p>
                </div>
              </div>
              {maxRain > 0 ? (
                <ul className="mt-3 flex items-end gap-1.5">
                  {week.map((day) => {
                    const mm = day.rain || 0;
                    return (
                      <li key={day.dt} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <span className="lf-cap text-muted-foreground" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{mm > 0 ? mm.toFixed(mm < 10 ? 1 : 0) : ''}</span>
                        <span className="flex h-16 w-full items-end overflow-hidden rounded-lg bg-muted" aria-hidden><span className="w-full rounded-lg bg-info" style={{ height: `${(mm / maxRain) * 100}%` }} /></span>
                        <span className="lf-cap w-full truncate text-center text-muted-foreground">{new Date(day.dt * 1000).toLocaleDateString(numLocale, { weekday: 'short' })}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="lf-lab mt-3 font-normal text-muted-foreground">{t('weather.rainfall.no_rain')}</p>
              )}
            </div>
          </section>

          <SevenDayForecast forecast={forecast} />
        </div>
      </PullRefreshController>
    </PageShell>
  );
};
