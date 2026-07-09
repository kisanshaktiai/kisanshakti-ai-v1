/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (audit trail — newest first, keep entries short)
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-07-09 14:35 UTC — Phase B. Default flipped to ACTIVE. Navigator is now
 *   the graph authority for every tenant unless explicitly disabled via
 *   DECISION_GRAPH_NAVIGATOR="off". Shadow mode stays independent (ON by
 *   default) so legacy producer traces continue to be recorded for compare.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NAVIGATOR FEATURE FLAG — v3 Phase B (Authority)
 * ───────────────────────────────────────────────────────────────────────────
 * Resolves whether the Decision Graph Navigator runs in **shadow** mode
 * (log-only) or **active** mode (authoritative decision producer).
 *
 * Resolution order (first match wins):
 *   1. Per-tenant blocklist:  DECISION_GRAPH_NAVIGATOR_TENANTS_OFF="t1,t2"
 *   2. Per-tenant allowlist:  DECISION_GRAPH_NAVIGATOR_TENANTS="t1,t2,..."
 *      (kept for staged rollout / rollback drills)
 *   3. Global env:            DECISION_GRAPH_NAVIGATOR="off"|"on"
 *   4. Default:               ACTIVE (Phase B graph-authority default)
 *
 * Shadow mode:
 *   NAVIGATOR_SHADOW="off"  → disable shadow logging (default: ON)
 *
 * No DB IO. Pure env read.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const TRUTHY = new Set(['on', 'true', '1', 'yes', 'enabled']);
const FALSY  = new Set(['off', 'false', '0', 'no', 'disabled']);

function envFlag(name: string): boolean | null {
  try {
    const v = String(Deno.env.get(name) || '').trim().toLowerCase();
    if (!v) return null;
    if (TRUTHY.has(v)) return true;
    if (FALSY.has(v))  return false;
    return null;
  } catch {
    return null;
  }
}

function envList(name: string): Set<string> {
  try {
    const raw = String(Deno.env.get(name) || '').trim();
    if (!raw) return new Set();
    return new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

export interface NavigatorFlagInput {
  readonly tenant_id?: string | null;
}

export interface NavigatorFlagState {
  /** When true, navigator output may drive the response. */
  readonly active: boolean;
  /** When true, navigator runs in shadow (log-only) mode every turn. */
  readonly shadow: boolean;
  readonly reason: string;
}

export function resolveNavigatorFlag(input: NavigatorFlagInput = {}): NavigatorFlagState {
  const shadow = envFlag('NAVIGATOR_SHADOW') !== false; // default ON

  const tenant = String(input.tenant_id || '').trim().toLowerCase();

  // (1) Tenant blocklist — surgical rollback for a specific tenant
  const block = envList('DECISION_GRAPH_NAVIGATOR_TENANTS_OFF');
  if (tenant && block.has(tenant)) {
    return Object.freeze({ active: false, shadow, reason: 'tenant_blocklisted' });
  }

  // (2) Tenant allowlist (legacy staged rollout — no-op when empty)
  const allow = envList('DECISION_GRAPH_NAVIGATOR_TENANTS');
  if (tenant && allow.size > 0 && allow.has(tenant)) {
    return Object.freeze({ active: true, shadow, reason: 'tenant_allowlisted' });
  }

  // (3) Global env override
  const global = envFlag('DECISION_GRAPH_NAVIGATOR');
  if (global === true)  return Object.freeze({ active: true,  shadow, reason: 'global_env_on' });
  if (global === false) return Object.freeze({ active: false, shadow, reason: 'global_env_off' });

  // (4) Phase B default — navigator is the graph authority.
  return Object.freeze({ active: true, shadow, reason: 'default_on_phase_b' });
}
