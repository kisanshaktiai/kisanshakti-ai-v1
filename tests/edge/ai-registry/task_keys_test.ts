// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: tests/edge/ai-registry/task_keys_test.ts
//
// CHANGE LOG
// 2026-09-27 — AI model SSOT, all call sites: every task key named in code must be a route in the
//   registry. Routes = the live registry read 2026-09-26 plus the routes created by migration
//   supabase/migrations/20260927100000_ai_registry_call_site_routes.sql (read from the file, so the
//   test follows the migration). A typo here would otherwise surface only in production as
//   route_missing → the call site's no-AI fallback.
//   Run with: deno test --allow-read tests/edge/ai-registry/

import { assert } from "../../decision-brain/assert.ts";

const ROOT = "supabase/functions";
const LIVE = JSON.parse(await Deno.readTextFile("tests/edge/ai-registry/fixture_live_registry_2026-09-26.json"));
const MIGRATION = await Deno.readTextFile("supabase/migrations/20260927100000_ai_registry_call_site_routes.sql");

const routes = new Set<string>(LIVE.ai_task_route.map((r: { task_key: string }) => r.task_key));
// Accepts both INSERT … VALUES ('key', …) and INSERT … SELECT 'key', … (the re-runnable form).
for (const m of MIGRATION.matchAll(/INSERT INTO public\.ai_task_route\s*\([^)]*\)\s*(?:VALUES\s*\(|SELECT)\s*'([a-z][a-z0-9_.]*)'/g)) routes.add(m[1]);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}(),])\/\/.*$/gm, "$1");
}

Deno.test("every task key used in code exists as an ai_task_route", async () => {
  const used = new Map<string, string[]>();
  async function walk(dir: string) {
    for await (const e of Deno.readDir(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) await walk(p);
      else if (p.endsWith(".ts")) {
        const src = stripComments(await Deno.readTextFile(p));
        const keys = [
          ...[...src.matchAll(/\btask:\s*['"]([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)['"]/g)].map((m) => m[1]),
          ...[...src.matchAll(/resolveAITaskChain\([^,]+,\s*['"]([a-z][a-z0-9_.]+)['"]\)/g)].map((m) => m[1]),
          ...[...src.matchAll(/recordAITaskCall\([^{]*\{\s*task:\s*['"]([a-z][a-z0-9_.]+)['"]/g)].map((m) => m[1]),
        ];
        for (const k of keys) used.set(k, [...(used.get(k) ?? []), p.slice(ROOT.length + 1)]);
      }
    }
  }
  await walk(ROOT);
  assert(used.size >= 15, `expected the migrated call sites to name at least 15 task keys, found ${used.size}`);
  const missing = [...used.entries()].filter(([k]) => !routes.has(k)).map(([k, files]) => `${k} (${[...new Set(files)].join(", ")})`);
  assert(missing.length === 0, "\n" + missing.join("\n"));
});
