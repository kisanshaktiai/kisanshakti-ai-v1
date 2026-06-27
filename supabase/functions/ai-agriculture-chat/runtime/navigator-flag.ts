/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NAVIGATOR FEATURE FLAG — v3 Phase 3
 * ═══════════════════════════════════════════════════════════════════════════
 * Resolves whether the Decision Graph Navigator runs in **shadow** mode
 * (always — Phase 2) or **active** mode (Phase 3, behind flag).
 *
 * Resolution order (first match wins):
 *   1. Per-tenant allowlist:  DECISION_GRAPH_NAVIGATOR_TENANTS="t1,t2,..."
 *   2. Global env:            DECISION_GRAPH_NAVIGATOR="on" | "true" | "1"
 *   3. Default:               OFF (legacy producers still drive UX)
 *
 * Shadow mode is independent and controlled by:
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
  const allow  = envList('DECISION_GRAPH_NAVIGATOR_TENANTS');
  if (tenant && allow.size > 0 && allow.has(tenant)) {
    return Object.freeze({ active: true, shadow, reason: 'tenant_allowlisted' });
  }

  const global = envFlag('DECISION_GRAPH_NAVIGATOR');
  if (global === true)  return Object.freeze({ active: true,  shadow, reason: 'global_env_on' });
  if (global === false) return Object.freeze({ active: false, shadow, reason: 'global_env_off' });

  return Object.freeze({ active: false, shadow, reason: 'default_off' });
}
