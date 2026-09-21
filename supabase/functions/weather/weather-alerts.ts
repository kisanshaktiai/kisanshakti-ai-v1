import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import type { ImdWarning } from "./imd-provider.ts";

export interface CurrentWeatherAlert {
  provider: "IMD";
  district: string;
  alert_types: string[];
  severity: string;
  color_code: number | null;
  valid_from: string;
  valid_to: string;
}

const normalizeDistrict = (value: string) =>
  value.trim().toLocaleLowerCase("en-IN").replace(/\s+district$/u, "").replace(/\s+/gu, " ");

export const districtNamesMatch = (left: string, right: string) =>
  normalizeDistrict(left) === normalizeDistrict(right);

export function selectCurrentDistrictWarning(
  warnings: ImdWarning[], districtName: string | null | undefined, now = new Date(),
): ImdWarning | null {
  if (!districtName) return null;
  const current = warnings.filter((warning) =>
    districtNamesMatch(warning.district, districtName) &&
    new Date(warning.valid_from).getTime() <= now.getTime() &&
    new Date(warning.valid_to).getTime() > now.getTime()
  );
  const priority = (warning: ImdWarning) => warning.color_code == null ? 0 : 5 - warning.color_code;
  return current.sort((a, b) => priority(b) - priority(a))[0] ?? null;
}

export function toCurrentWeatherAlert(warning: ImdWarning): CurrentWeatherAlert {
  return {
    provider: "IMD", district: warning.district, alert_types: warning.alert_types,
    severity: warning.severity, color_code: warning.color_code,
    valid_from: warning.valid_from, valid_to: warning.valid_to,
  };
}

export async function persistImdWarnings(
  supabase: SupabaseClient, warnings: ImdWarning[], tenantId: string,
): Promise<void> {
  for (const warning of warnings) {
    const alertId = `IMD:${warning.obj_id}:${warning.day}:${warning.issued_at}`;
    const row = {
      alert_id: alertId, area_name: warning.district,
      event_type: warning.alert_types[0] ?? "WEATHER_WARNING",
      severity: warning.severity, urgency: warning.color_code === 1 ? "immediate" : "expected",
      certainty: "observed", title: warning.alert_types.join(", "),
      description: null, instruction: null, start_time: warning.valid_from,
      end_time: warning.valid_to, data_source: "IMD",
      is_active: new Date(warning.valid_to).getTime() > Date.now(), tenant_id: tenantId,
      imd_district_obj_id: warning.obj_id, imd_color_code: warning.color_code,
      imd_warning_codes: warning.alert_types, alert_kind: "district_warning",
      last_fetched: new Date().toISOString(),
    };
    const { data: existing, error: readError } = await supabase.from("weather_alerts")
      .select("id").eq("alert_id", alertId).eq("tenant_id", tenantId).maybeSingle();
    if (readError) throw readError;
    const query = existing?.id
      ? supabase.from("weather_alerts").update(row).eq("id", existing.id)
      : supabase.from("weather_alerts").insert(row);
    const { error } = await query;
    if (error) throw error;
  }
}