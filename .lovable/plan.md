
# Forensic Edge Function Audit — what is truly safe to delete

## Method (this round was stricter than the last)

1. Listed all 31 function folders under `supabase/functions/`.
2. For each candidate, grepped **every** reference across `src/**`, `supabase/**`, `*.sql`, `*.toml`, `*.json`, `*.md` — and explicitly excluded the function's own folder so self-references don't create false positives.
3. **Live-DB cron audit** via `cron.job` — caught references that live only in `pg_cron` and never appear in source. This is what changed the verdict on `proactive-evaluator` vs. the previous pass.
4. Cross-checked candidate-orphans against frontend hooks that *might* implement the same feature client-side (e.g. `useYouTubeChannelReels` → it fetches YouTube RSS directly, does **not** call the edge function).

## Live cron jobs (ground truth from DB)

| Cron job | Function it calls | Verdict |
|---|---|---|
| `analytics-forecast-monthly` | `analytics-forecast` | KEEP |
| `proactive-evaluator-cron` (every 15 min, 5–21h) | **`proactive-evaluator`** | **KEEP — was almost wrongly flagged last round** |
| `governance-nightly-audit` | `governance-audit` (no local source) | unrelated |
| `mark-agricultural-tiles-every-5min` | `mark-agricultural-tiles` (no local source) | unrelated |
| `weekly-ndvi-auto-sync` | `weekly-ndvi-sync` (no local source) | unrelated |
| 6× internal `cleanup_*` jobs | pure SQL functions | unrelated |

No cron references `validation-monitor`, `ai-query-understanding`, `community-translate`, `generate-manifest`, `youtube-channel-feed`, or `seed-decision-rules`.

## Reference scan results for candidate orphans

For each function below, the **only** match anywhere in the repo was its own `[functions.<name>]` block in `supabase/config.toml` (a `verify_jwt` flag, not a usage):

| Function | Refs outside its folder | Where | Safe to delete? |
|---|---|---|---|
| `ai-query-understanding` | 1 | `config.toml` only | ✅ YES |
| `community-translate` | 1 | `config.toml` only | ✅ YES |
| `generate-manifest` | 1 | `config.toml` only | ✅ YES |
| `youtube-channel-feed` | 1 | `config.toml` only — RSS fetched client-side in `useYouTubeChannelReels.ts` | ✅ YES |
| `validation-monitor` | 1 | `config.toml` only — no cron | ✅ YES |
| `seed-decision-rules` | 1 | `config.toml` only — dev/admin seeder | ⚠️ Optional (keep cheap to retain) |
| `proactive-evaluator` | 0 in code — **but live cron every 15 min** | `cron.job` | 🔴 **DO NOT DELETE** |

## What changed vs. last audit

- Previous pass missed the **`cron.job` table** entirely, so `proactive-evaluator` looked like an orphan. It isn't — it powers the proactive intelligence loop (see `mem://logic/proactive-intelligence-reasoning-core`) and runs every 15 minutes during daytime. Deleting it would silently break tenant-wide proactive alerts.
- Multi-tenant impact assessed: all 7 candidates above are stateless utility/orphan functions and have no per-tenant routing, no RLS dependency, no shared cache, no other function importing them. Removing them affects zero tenants.

## Recommended deletions (forensic-clean, 5 functions)

1. `ai-query-understanding`
2. `community-translate`
3. `generate-manifest`
4. `youtube-channel-feed`
5. `validation-monitor`

Frees **5 deployment slots** — enough for `harvest-engine` plus headroom.

## Optional 6th

6. `seed-decision-rules` — dev-only seeder, zero runtime traffic. Delete only if you need one more slot; otherwise keep it so re-seeding agronomic rules doesn't require a redeploy.

## Execution (after approval, in build mode)

For each function in the list above:
- `supabase--delete_edge_functions` (removes the deployed function)
- `rm -rf supabase/functions/<name>` (removes source)
- Remove its `[functions.<name>]` block from `supabase/config.toml`

Then verify with `ls supabase/functions/` and a fresh `cron.job` snapshot to confirm nothing references the deleted names.

Approve to switch to build mode and execute the 5 deletions (and tell me whether to also drop `seed-decision-rules`).
