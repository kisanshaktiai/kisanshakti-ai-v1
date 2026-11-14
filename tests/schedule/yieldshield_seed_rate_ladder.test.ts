// A seed rate is never left blank. getSeedRate falls back from a verified variety rate to the authored
// crop standard to an unverified variety estimate — and cross-checks the chosen rate against the crop
// band. Every number comes from a DB row; nothing is invented. Replayed on fixture rows via the fake client.
import { describe, expect, it } from "vitest";
import { getSeedRate } from "../../supabase/functions/ai-smart-schedule/db/agronomy-repo";
import { fakeSupabase } from "./fixtures/fake-supabase";

const V = "861012bf-b223-4944-b2c5-a66f7cbc9f49";
// Indrayani is an OPV (non-hybrid). The authored transplanted crop standard is 30-40 kg/ha (12.14-16.19
// kg/acre), midpoint ~14.17; the variety's own transplanted row is D_unverified at 8.1-10.1 kg/acre.
const cropStdTransplantedNonHybrid = {
  crop_code: "rice", cultivation_method: "transplanted", seed_rate_variety_type: "non_hybrid", region_code: null,
  seed_rate_kg_per_acre_min: 12.14, seed_rate_kg_per_acre_max: 16.19, seed_rate_basis_code: "NURSERY",
  seed_rate_rationale: "improved transplanted paddy", source: "MPKV Krishi Darshani 2026", evidence_tier: "C_documented_source",
  review_status: "approved", is_active: true,
};
const vcaTransplantedUnverified = {
  variety_id: V, crop_code: "rice", cultivation_method: "transplanted", is_active: true,
  seed_rate_kg_per_acre_min: 8.1, seed_rate_kg_per_acre_max: 10.1, evidence_tier: "D_unverified",
  seed_rate_variety_type: "opv_coarse_fine", seed_rate_basis_code: "NURSERY", target_plants_per_m2: null, source: "unverified row",
};
const vcaVerified = {
  variety_id: V, crop_code: "rice", cultivation_method: "transplanted", is_active: true,
  seed_rate_kg_per_acre_min: 13.0, seed_rate_kg_per_acre_max: 15.0, evidence_tier: "C_documented_source",
  seed_rate_variety_type: "opv_coarse_fine", seed_rate_basis_code: "NURSERY", target_plants_per_m2: null, source: "verified row",
};
const fx = (vca: unknown[], std: unknown[]) => ({ tables: { variety_cultivation_agronomy: vca, crop_seed_rate_standard: std }, rpc: {} });

describe("seed-rate ladder — never blank, never invented", () => {
  it("rung 1: a verified variety rate is used and marked variety-tuned", async () => {
    const r = (await getSeedRate(fakeSupabase(fx([vcaVerified], [cropStdTransplantedNonHybrid])) as never, V, "transplanted", "transplanted", "rice"))!;
    expect(r.basis).toBe("variety_verified");
    expect(r.varietyTuned).toBe(true);
    expect(r.kgPerAcre).toBeCloseTo(14.0, 2);
    expect(r.outsideCropBand).toBe(false);
  });

  it("rung 2: with only an UNVERIFIED variety row, the authored crop standard is used (not the unverified number)", async () => {
    const r = (await getSeedRate(fakeSupabase(fx([vcaTransplantedUnverified], [cropStdTransplantedNonHybrid])) as never, V, "transplanted", "transplanted", "rice"))!;
    expect(r.basis).toBe("crop_standard");
    expect(r.varietyTuned).toBe(false);
    expect(r.kgPerAcre).toBeCloseTo((12.14 + 16.19) / 2, 2); // the standard, ~14.17, not the 9.1 estimate
    expect(String(r.provenance.source)).toContain("crop_standard");
  });

  it("rung 3: no crop standard either — the unverified variety estimate is the last resort, never blank", async () => {
    const r = (await getSeedRate(fakeSupabase(fx([vcaTransplantedUnverified], [])) as never, V, "transplanted", "transplanted", "rice"))!;
    expect(r.basis).toBe("variety_unverified");
    expect(r.varietyTuned).toBe(false);
    expect(r.kgPerAcre).toBeCloseTo(9.1, 2);
  });

  it("no variety row at all: the crop standard still gives a non-blank rate", async () => {
    const r = (await getSeedRate(fakeSupabase(fx([], [cropStdTransplantedNonHybrid])) as never, V, "transplanted", "transplanted", "rice"))!;
    expect(r.basis).toBe("crop_standard");
    expect(r.kgPerAcre).toBeGreaterThan(0);
  });

  it("only returns null when there is genuinely no rate anywhere (true gap, still never fabricated)", async () => {
    expect(await getSeedRate(fakeSupabase(fx([], [])) as never, V, "transplanted", "transplanted", "rice")).toBeNull();
  });

  it("cross-check: a verified variety rate far outside the crop band is flagged for review", async () => {
    const wild = { ...vcaVerified, seed_rate_kg_per_acre_min: 60, seed_rate_kg_per_acre_max: 60 };
    const r = (await getSeedRate(fakeSupabase(fx([wild], [cropStdTransplantedNonHybrid])) as never, V, "transplanted", "transplanted", "rice"))!;
    expect(r.basis).toBe("variety_verified");
    expect(r.outsideCropBand).toBe(true);
  });

  it("is crop-agnostic: the standard is matched by crop_code and method, with no rice-specific branch", async () => {
    const wheatStd = { ...cropStdTransplantedNonHybrid, crop_code: "wheat", cultivation_method: "direct_seeded", seed_rate_kg_per_acre_min: 40, seed_rate_kg_per_acre_max: 50 };
    const r = (await getSeedRate(fakeSupabase(fx([], [wheatStd])) as never, "w1", "direct_seeded", "direct_seeded", "wheat"))!;
    expect(r.basis).toBe("crop_standard");
    expect(r.kgPerAcre).toBeCloseTo(45, 2);
  });
});
