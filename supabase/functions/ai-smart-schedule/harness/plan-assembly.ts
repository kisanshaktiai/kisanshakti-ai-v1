/**
 * Compact planner output → full schedule_plan_intent_v3 — pure.
 *
 * 2026-11-12 — root cause of the permanent "deterministic_fallback / MODEL_TIMEOUT" trace: the
 * planner had to echo EVERY candidate (id + order + status + reason; ~138 on a live rice plan)
 * inside one 25 s call, and the first slow provider consumed the whole budget. The model now
 * returns only its DECISIONS — the candidates whose status it changes or wants to explain. The
 * order is assembled here deterministically from the DB-backed graph (day, dependency edges,
 * stage order) and the result is checked by the unchanged validatePlanIntent, so the model can
 * still never invent, drop or promote a candidate.
 */
import type { CandidateNode, PlanIntent, PlanItem, ScheduleCandidateGraph } from "./types.ts";

const STATUSES = new Set(["SCHEDULED", "CONDITIONAL", "MONITOR", "INSUFFICIENT_DATA"]);
export interface CompactDecision { candidate_id: string; status?: string; reason?: string }

/** Deterministic order honouring dependency edges; ties by day, required-first, stage order, id. */
export function orderCandidates(graph: ScheduleCandidateGraph): CandidateNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, Set<string>>();
  for (const e of graph.edges) if (byId.has(e.from) && byId.has(e.to)) (incoming.get(e.to) ?? incoming.set(e.to, new Set()).get(e.to)!).add(e.from);
  const cmp = (a: CandidateNode, b: CandidateNode) =>
    a.days_from_sowing - b.days_from_sowing || Number(b.required) - Number(a.required) ||
    a.stage_order - b.stage_order || a.id.localeCompare(b.id);
  const pending = [...graph.nodes].sort(cmp);
  const placed = new Set<string>();
  const out: CandidateNode[] = [];
  while (pending.length) {
    let i = pending.findIndex((n) => [...(incoming.get(n.id) ?? [])].every((d) => placed.has(d)));
    if (i < 0) i = 0; // dependency cycle in the data: keep day order; the validator reports it
    const [n] = pending.splice(i, 1);
    placed.add(n.id); out.push(n);
  }
  return out;
}

export function assembleCompactPlan(
  graph: ScheduleCandidateGraph,
  compact: { schema_version?: unknown; status?: unknown; decisions?: CompactDecision[]; uncertainties?: unknown; domain_coverage?: unknown; reasoning_summary?: unknown },
): PlanIntent {
  const decisions = new Map<string, CompactDecision>();
  for (const d of Array.isArray(compact.decisions) ? compact.decisions : []) if (d && d.candidate_id) decisions.set(String(d.candidate_id), d);
  const known = new Set(graph.nodes.map((n) => n.id));
  const sequence: PlanItem[] = orderCandidates(graph).map((n, i) => {
    const d = decisions.get(n.id);
    const status = d?.status && STATUSES.has(String(d.status).toUpperCase()) ? String(d.status).toUpperCase() : (n.required ? "SCHEDULED" : n.default_status);
    return {
      candidate_id: n.id, sequence_order: i + 1, status: status as PlanItem["status"],
      reason: d?.reason ? String(d.reason) : n.required ? "Database-backed baseline task." : `Database classification retained (${n.default_status}).`,
    };
  });
  // A decision about an id that was never supplied must fail validation, not vanish.
  for (const id of decisions.keys()) if (!known.has(id)) sequence.push({ candidate_id: id, sequence_order: sequence.length + 1, status: "INSUFFICIENT_DATA", reason: "unknown candidate" });
  const coverage = compact.domain_coverage && typeof compact.domain_coverage === "object"
    ? Object.fromEntries(Object.entries(compact.domain_coverage as Record<string, unknown>).map(([k, v]) => [String(k).toUpperCase(), String(v).toUpperCase()])) : undefined;
  return {
    schema_version: String(compact.schema_version ?? ""), status: String(compact.status ?? "") as PlanIntent["status"], sequence,
    uncertainties: Array.isArray(compact.uncertainties) ? compact.uncertainties.map(String) : [],
    domain_coverage: coverage, reasoning_summary: String(compact.reasoning_summary ?? ""),
  };
}

/** Accept the compact contract; a model that still returns a full `sequence` is honoured as before. */
export function planFromModelOutput(parsed: Record<string, unknown>, graph: ScheduleCandidateGraph): PlanIntent {
  if (Array.isArray(parsed.sequence) && parsed.sequence.length) {
    return {
      schema_version: String(parsed.schema_version ?? ""), status: String(parsed.status ?? "") as PlanIntent["status"],
      sequence: (parsed.sequence as Array<Record<string, unknown>>).map((x) => ({ candidate_id: String(x.candidate_id ?? ""), sequence_order: Number(x.sequence_order), status: String(x.status ?? "INSUFFICIENT_DATA") as PlanItem["status"], reason: x.reason == null ? undefined : String(x.reason) })),
      uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties.map(String) : [],
      domain_coverage: parsed.domain_coverage && typeof parsed.domain_coverage === "object" ? Object.fromEntries(Object.entries(parsed.domain_coverage as Record<string, unknown>).map(([k, v]) => [String(k).toUpperCase(), String(v).toUpperCase()])) : undefined,
      reasoning_summary: String(parsed.reasoning_summary ?? ""),
    };
  }
  return assembleCompactPlan(graph, parsed as Parameters<typeof assembleCompactPlan>[1]);
}

/** Time one provider may use: never the whole remaining budget while another provider is waiting. */
export function providerBudgetMs(remainingMs: number, providersLeft: number, capMs: number, minUsefulMs: number): number {
  if (remainingMs < minUsefulMs) return 0;
  const share = providersLeft > 1 ? Math.floor(remainingMs * 0.6) : remainingMs;
  return Math.min(capMs, Math.max(minUsefulMs, share));
}

export interface PlannerCall { plan: PlanIntent; provider: string; model: string }
export type PlannerOutcome =
  | { ok: true; plan: PlanIntent; provider: string; model: string; attempts: number; errors: string[] }
  | { ok: false; attempts: number; errors: string[] };

/** Bounded plan → validate → repair loop. `request` is the only impure dependency. */
export async function runPlanner(
  graph: ScheduleCandidateGraph,
  request: (repairErrors: string[]) => Promise<PlannerCall>,
  validate: (plan: PlanIntent, graph: ScheduleCandidateGraph) => string[],
  opts: { maxAttempts: number; minAttemptMs: number; remainingMs: () => number },
): Promise<PlannerOutcome> {
  let errors: string[] = opts.remainingMs() < opts.minAttemptMs ? ["PLANNER_BUDGET_EXHAUSTED"] : [];
  let attempts = 0;
  while (attempts < opts.maxAttempts && opts.remainingMs() >= opts.minAttemptMs) {
    attempts += 1;
    try {
      const r = await request(errors);
      const validationErrors = validate(r.plan, graph);
      if (!validationErrors.length && r.plan.status === "READY") return { ok: true, ...r, attempts, errors: [] };
      errors = validationErrors.length ? validationErrors : [`planner_status:${r.plan.status}`];
    } catch (error) {
      errors = [error instanceof Error ? error.message : String(error)];
      if (errors[0] === "MODEL_UNAVAILABLE" || errors[0] === "MODEL_TIMEOUT") break;
    }
  }
  return { ok: false, attempts, errors };
}
