// CHANGE LOG
// 2026-08-18 18:58 UTC — Phase C1: one stage, everywhere. Locks the invariant that
//   resolve_crop_phenology / lands.stage_uuid is the ONLY stage authority and that no
//   scheduler or UI file re-derives a stage from DAS.

import { assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(p);

Deno.test("reconciler reads the stage SSOT and never computes one", async () => {
  const src = await read("supabase/functions/schedule-reconciler/index.ts");
  assert(src.includes("resolve_crop_phenology"), "reconciler must resolve stage via the DB SSOT");
  assert(
    !/crop_stage_master[\s\S]{0,400}das_min\s*<=/.test(src),
    "reconciler must not re-derive a stage from DAS windows",
  );
});

Deno.test("reconciler can be scoped to a single land (event-driven reconcile)", async () => {
  const src = await read("supabase/functions/schedule-reconciler/index.ts");
  assert(src.includes("landId"), "reconciler must accept a landId filter");
  assert(src.includes('q.eq("land_id"'), "landId must filter the schedule query");
});

Deno.test("frontend reads land stage only through the useLandStage SSOT hook", async () => {
  const hook = await read("src/hooks/useLandStage.ts");
  assert(hook.includes("stage_uuid"), "hook must read lands.stage_uuid");
  assert(!hook.includes("das_max"), "hook must not compute a stage from DAS windows");

  const uiFiles = [
    "src/components/schedule/CropScheduleView.tsx",
    "src/components/schedule/TaskTimeline.tsx",
    "src/components/schedule/ModernTaskCard.tsx",
  ];
  for (const f of uiFiles) {
    const src = await read(f);
    assert(
      !src.includes("resolve_crop_phenology"),
      `${f} must not call the stage resolver directly — read it through useLandStage`,
    );
    assert(
      !/das_min|das_max/.test(src),
      `${f} must not derive a stage from DAS windows`,
    );
  }
});

Deno.test("only the phenology resolver writes the land stage", async () => {
  const candidates = [
    "supabase/functions/schedule-reconciler/index.ts",
    "supabase/functions/ai-smart-schedule/index.ts",
    "supabase/functions/ai-smart-schedule/generator/baseline-generator.ts",
  ];
  for (const f of candidates) {
    const src = await read(f);
    assert(
      !/from\(["']lands["']\)[\s\S]{0,200}\.update\([\s\S]{0,200}stage_uuid/.test(src),
      `${f} must never write lands.stage_uuid`,
    );
  }
});
