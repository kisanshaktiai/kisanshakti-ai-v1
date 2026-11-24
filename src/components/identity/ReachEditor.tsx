import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LocationPickerSection, type LocationValue } from '@/components/land/LocationPickerSection';
import { accountReachService, ReachError } from '@/services/accountReachService';
import type { ReachState } from '@/stores/accountStore';
import { radiusSteps, type AccountRole } from '@/lib/accountRoles';

interface ReachEditorProps {
  /** Every role listed gets the same Reach (onboarding sets all at once). */
  roles: AccountRole[];
  /** Current Reach of the first role, when one is already known. */
  initial?: ReachState | null;
  submitLabel: string;
  onSaved: (reach: ReachState) => void;
}

/**
 * Base village + radius. The village comes from the existing location picker
 * (state → district → taluka → village from the villages master); the radius is
 * a slider over the steps the server policy allows. Nothing is validated here
 * that the database function does not validate again.
 */
export function ReachEditor({ roles, initial, submitLabel, onSaved }: ReachEditorProps) {
  const { t, i18n } = useTranslation();
  const primaryRole = roles[0];
  const [reach, setReach] = useState<ReachState | null>(initial ?? null);
  const [location, setLocation] = useState<LocationValue>({ country: 'India', country_code: 'IN' });
  const [radius, setRadius] = useState<number | null>(initial?.radius_km ?? null);
  const [loading, setLoading] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The policy (bounds, step, default, changes left) always comes from the server.
  useEffect(() => {
    let cancelled = false;
    if (!primaryRole) return;
    setLoading(true);
    accountReachService.get(primaryRole)
      .then((current) => {
        if (cancelled) return;
        setReach(current);
        setRadius((prev) => prev ?? current.radius_km ?? current.policy.radius_default_km);
      })
      .catch((err) => { if (!cancelled) setError(messageFor(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryRole]);

  const steps = useMemo(
    () => (reach ? radiusSteps(reach.policy.radius_min_km, reach.policy.radius_max_km, reach.policy.radius_step_km) : []),
    [reach],
  );

  function messageFor(err: unknown): string {
    if (err instanceof ReachError) {
      if (err.code === 'REACH_CHANGE_LIMIT_REACHED' && err.nextChangeAt) {
        const when = new Date(err.nextChangeAt);
        if (!Number.isNaN(when.getTime())) {
          return t('identity.reach.errors.REACH_CHANGE_LIMIT_REACHED_AT', { when: when.toLocaleString(i18n.language) });
        }
      }
      return t(`identity.reach.errors.${err.code}`);
    }
    return t('identity.reach.errors.REACH_UNAVAILABLE');
  }

  // A change of radius alone keeps the village already saved.
  const villageId = location.village_id ?? reach?.base_village_id ?? null;
  const villageName = location.village_id ? location.village ?? null : reach?.village_name ?? null;
  const unchanged =
    !!reach?.is_set && villageId === reach.base_village_id && radius === reach.radius_km;
  const limitReached = !!reach?.is_set && reach.changes_remaining <= 0;
  const canSave = !!villageId && radius != null && !saving && !loading && !unchanged && !limitReached;

  const handleSave = async () => {
    if (!villageId || radius == null) return;
    setSaving(true);
    setError(null);
    try {
      let saved: ReachState | null = null;
      for (const role of roles) {
        const result = await accountReachService.set(role, villageId, radius, villageName);
        if (role === primaryRole) saved = result;
      }
      if (saved) {
        setReach(saved);
        onSaved(saved);
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !reach) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">{t('identity.reach.villageLabel')}</p>
        <p className="text-xs text-muted-foreground">{t('identity.reach.villageHint')}</p>
        {reach?.is_set && !location.village_id && (
          <p className="text-sm text-foreground">
            {t('identity.reach.currentVillage', {
              village: reach.village_name || t('identity.reach.villageSaved'),
            })}
          </p>
        )}
        <LocationPickerSection value={location} onChange={setLocation} hideHeading />
        {location.village && !location.village_id && (
          <p className="text-xs text-destructive">{t('identity.reach.villageFromList')}</p>
        )}
      </div>

      {reach && steps.length > 0 && radius != null && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-foreground">{t('identity.reach.radiusLabel')}</p>
            <p className="text-lg font-bold text-primary">{t('identity.reach.radiusValue', { km: radius })}</p>
          </div>
          <Slider
            aria-label={t('identity.reach.radiusLabel')}
            min={reach.policy.radius_min_km}
            max={reach.policy.radius_max_km}
            step={reach.policy.radius_step_km}
            value={[radius]}
            onValueChange={(value) => setRadius(value[0])}
            disabled={saving}
            className="py-3"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('identity.reach.radiusValue', { km: reach.policy.radius_min_km })}</span>
            <span>{t('identity.reach.radiusValue', { km: reach.policy.radius_max_km })}</span>
          </div>
        </div>
      )}

      {reach?.is_set && (
        <p className="text-xs text-muted-foreground">
          {t('identity.reach.changesRemaining', {
            count: reach.changes_remaining,
            days: reach.policy.change_limit_window_days,
          })}
        </p>
      )}

      <Button onClick={handleSave} disabled={!canSave} className="w-full h-12 text-base">
        {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </div>
  );
}
