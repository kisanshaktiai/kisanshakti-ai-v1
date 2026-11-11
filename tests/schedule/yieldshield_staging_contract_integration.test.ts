import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";

const source=(path:string)=>readFileSync(path,"utf8");
const reconciler=source("supabase/functions/schedule-reconciler/index.ts");
const generator=source("supabase/functions/ai-smart-schedule/index.ts");
const api=source("supabase/functions/schedules-api/index.ts");
const decisions=source("supabase/functions/schedule-reconciler/decision-application.ts");
const config=source("supabase/config.toml");

describe("YieldShield staging integration source contracts (no production calls)",()=>{
 it("reconciler checks service auth before querying the schedule table",()=>{
   expect(reconciler.indexOf("await authorizeReconciler(")).toBeGreaterThan(0);
   expect(reconciler.indexOf("await authorizeReconciler(")).toBeLessThan(reconciler.indexOf('.from("crop_schedules")'));
   expect(reconciler).toContain('if (!authorized) return json(');
   expect(reconciler).toContain('if (req.method !== "POST")');
 });
 it("dry run prevents database writes including schedule-monitoring records",()=>{
   expect(reconciler).toContain("if (!canPersistMonitoring(dryRun)) return;");
   expect(reconciler).toContain('if (!dryRun) await supabase.from("schedule_adjustments").insert(');
   expect(reconciler).toContain('const { error: updErr } = dryRun ?');
   expect(decisions).toContain("if (input.dryRun) return true;");
   expect(decisions).toContain("if (!input.dryRun)");
 });
 it("generator checks agronomy readiness before model calls and persistence",()=>{
   expect(generator.indexOf("agronomyActivationBlockers(")).toBeGreaterThan(0);
   expect(generator.indexOf("agronomyActivationBlockers(")).toBeLessThan(generator.indexOf("applyScheduleHarness("));
   expect(generator.indexOf("agronomyActivationBlockers(")).toBeLessThan(generator.indexOf('supabase.rpc("persist_ai_crop_schedule_atomic"'));
   expect(generator).toContain('code:"AGRONOMY_REVIEW_REQUIRED"');
 });
 it("task completion must use the atomic ledger, not generic status update",()=>{
   expect(api).toContain("await resolveVerifiedCaller(req)");
   expect(api).toContain("COMPLETION_ENDPOINT_REQUIRED");
   expect(api).toContain("complete_schedule_task_atomic");
   const updateBlock=api.slice(api.indexOf("const ALLOWED = ["),api.indexOf("const updates: Record<string, unknown>"));
   expect(updateBlock).not.toMatch(/['"]status['"]\s*,/);
   expect(updateBlock).not.toMatch(/['"]completed_at['"]\s*,/);
 });
 it("all three endpoints declare explicit JWT behavior for custom farmer sessions",()=>{
   for(const slug of ["ai-smart-schedule","schedules-api","schedule-reconciler"]){
     expect(config).toContain(`[functions.${slug}]\nverify_jwt = false`);
   }
 });
});
