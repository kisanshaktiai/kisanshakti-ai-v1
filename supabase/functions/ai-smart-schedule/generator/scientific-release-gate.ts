/**
 * YieldShield crop publication gate — scientific signoff is data, not an AI opinion.
 * No DB writes. Missing registry, mismatched scope, stale graph, unverified approval
 * and incomplete biological stages cannot authorize an ACTIVE farmer schedule.
 */
import { isBiologicalHarvestStage } from "./agronomy-scientific-contract.ts";

export interface ReleaseStage {
  id: string;
  crop_code: string;
  growth_stage: string | null;
  stage_code: string | null;
  das_min: number | null;
  das_max: number | null;
  das_reference: string | null;
  clock_reference: string | null;
  gdd_min: number | null;
  gdd_max: number | null;
  base_temperature_c: number | null;
  cultivation_method: string | null;
  crop_cycle: string | null;
  is_moisture_critical: boolean | null;
  kc_coefficient: number | null;
  boundary_grace_days: number | null;
}

export interface ReleaseScope {
  cropCode: string;
  cultivationMethod: string;
  stageClockMethod: string;
  cropCycle: string;
  regionCode: string | null;
  varietyId: string | null;
}
export interface CropReleaseApproval {
  id: string;
  crop_code: string;
  cultivation_method: string;
  crop_cycle: string;
  region_code: string;
  variety_id: string | null;
  status: string;
  stage_graph_sha256: string;
  evidence_bundle_sha256: string;
  reviewed_by: string;
  reviewed_at: string;
  expires_at: string;
}
const normalized = (v: unknown) => String(v ?? "").trim().toLowerCase();
const sha256Pattern = /^[a-f0-9]{64}$/i;
const isFiniteDay = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function selectedGraphBlockers(stages: ReleaseStage[], scope: ReleaseScope): string[] {
  const errors = new Set<string>();
  if (!scope.regionCode?.trim()) errors.add("REGION_NOT_VERIFIED");
  if (!stages.length) errors.add("CROP_STAGE_GRAPH_MISSING");
  let terminal = false;
  const ids = new Set<string>();
  for (const stage of stages) {
    if (!stage.id || ids.has(stage.id)) errors.add("STAGE_GRAPH_IDENTITY_CONFLICT");
    ids.add(stage.id);
    if (normalized(stage.crop_code) !== normalized(scope.cropCode))
      errors.add("STAGE_CROP_MISMATCH");
    if (stage.cultivation_method &&
        !["any", normalized(scope.stageClockMethod)].includes(normalized(stage.cultivation_method)))
      errors.add("STAGE_METHOD_MISMATCH");
    if (stage.crop_cycle &&
        !["universal", normalized(scope.cropCycle)].includes(normalized(stage.crop_cycle)))
      errors.add("STAGE_CYCLE_MISMATCH");
    if (!normalized(stage.growth_stage) && !normalized(stage.stage_code))
      errors.add("STAGE_IDENTITY_MISSING");
    if (!isFiniteDay(stage.das_min) || !isFiniteDay(stage.das_max) ||
        (isFiniteDay(stage.das_min) && isFiniteDay(stage.das_max) && stage.das_min > stage.das_max))
      errors.add("STAGE_WINDOW_NOT_VERIFIED");
    if (isBiologicalHarvestStage(stage.growth_stage)) terminal = true;
  }
  if (!terminal) errors.add("BIOLOGICAL_HARVEST_STAGE_MISSING");
  return [...errors].sort();
}

/**
 * Hash only agronomically operative stage fields, in stable ID order.
 * An approval must be re-issued if a selected biological stage changes.
 */
export function canonicalStageGraph(stages: ReleaseStage[]): string {
  return JSON.stringify([...stages].sort((a, b) => a.id.localeCompare(b.id)).map(s => [
    s.id, s.crop_code, s.growth_stage, s.stage_code, s.das_min, s.das_max,
    s.das_reference, s.clock_reference, s.gdd_min, s.gdd_max, s.base_temperature_c,
    s.cultivation_method, s.crop_cycle, s.is_moisture_critical, s.kc_coefficient,
    s.boundary_grace_days,
  ]));
}
export async function stageGraphSha256(stages: ReleaseStage[]): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStageGraph(stages));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function cropReleaseBlockers(
  approval: CropReleaseApproval | null,
  scope: ReleaseScope,
  expectedGraphSha256: string,
  now: Date = new Date(),
): string[] {
  if (!scope.regionCode?.trim()) return ["REGION_NOT_VERIFIED"];
  if (!approval) return ["CROP_RELEASE_NOT_APPROVED"];
  const failures = new Set<string>();
  if (normalized(approval.crop_code) !== normalized(scope.cropCode) ||
      normalized(approval.cultivation_method) !== normalized(scope.cultivationMethod) ||
      normalized(approval.crop_cycle) !== normalized(scope.cropCycle) ||
      normalized(approval.region_code) !== normalized(scope.regionCode) ||
      normalized(approval.variety_id) !== normalized(scope.varietyId))
    failures.add("CROP_RELEASE_SCOPE_MISMATCH");
  if (approval.status !== "approved") failures.add("CROP_RELEASE_NOT_APPROVED");
  if (!sha256Pattern.test(approval.evidence_bundle_sha256) ||
      !normalized(approval.reviewed_by) ||
      !Number.isFinite(Date.parse(approval.reviewed_at)) ||
      Date.parse(approval.reviewed_at) > now.getTime())
    failures.add("CROP_RELEASE_EVIDENCE_UNVERIFIED");
  if (!sha256Pattern.test(approval.stage_graph_sha256) ||
      normalized(approval.stage_graph_sha256) !== normalized(expectedGraphSha256))
    failures.add("CROP_RELEASE_STAGE_GRAPH_STALE");
  if (!Number.isFinite(Date.parse(approval.expires_at)) ||
      Date.parse(approval.expires_at) <= now.getTime())
    failures.add("CROP_RELEASE_APPROVAL_EXPIRED");
  return [...failures].sort();
}
