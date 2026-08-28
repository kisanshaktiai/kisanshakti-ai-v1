// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: supabase/functions/ai-smart-schedule/db/rag-evidence.ts
//
// CHANGE LOG
// 2026-08-28 — P1 (audit Phase 2): schedule evidence adapter. Attaches verified RAG
//   corpus evidence (rag_chunks, via the shared hybrid retriever) to baseline tasks
//   AFTER deterministic generation. It never generates, alters, or reinterprets
//   agronomy: a task the corpus cannot support is tagged NO_EVIDENCE explicitly —
//   nothing is invented and generation is never blocked. Flag-gated in index.ts by
//   `rag_schedule_evidence`. Every retrieval is logged by ragRetrieve itself to
//   rag_retrieval_logs with purpose SCHEDULE_VALIDATION (purpose already exists in
//   _shared/ragRetrieval.ts — no retriever changes needed).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  ragRetrieve,
  type Evidence,
  type RagFilters,
} from "../../_shared/ragRetrieval.ts";
import type { BaselineTask } from "../generator/baseline-generator.ts";

// ── Engineering budgets (not agronomic constants) ───────────────────────────
// Retrieval is grouped so a 60–130-task schedule costs ~a dozen retrievals, not
// one per task. Groups past the caps are marked NOT_EVALUATED (never NO_EVIDENCE:
// a budget skip is not a corpus gap and must not be recorded as one).
const MAX_GROUPS = 12;
const TIME_BUDGET_MS = 10_000;
const EVIDENCE_PER_GROUP = 3;

export type TaskEvidenceStatus = "EVIDENCED" | "NO_EVIDENCE" | "NOT_EVALUATED";

export interface RagEvidenceContext {
  cropCode: string;
  cropLabel: string | null;
  /** v_land_region style code, e.g. "IN-MH"; the retriever wants states.code ("MH"). */
  regionCode: string | null;
  tenantId: string | null;
  farmerId: string | null;
}

export interface RagEvidenceSummary {
  attempted: boolean;
  groups_total: number;
  groups_queried: number;
  groups_below_threshold: string[];
  groups_skipped_budget: string[];
  tasks_evidenced: number;
  tasks_no_evidence: number;
  tasks_not_evaluated: number;
  embedding_model: string | null;
  retrieval_mode: string | null;
  trace_notes: string[];
  elapsed_ms: number;
}

/** Structured, citable ref stored on task.resources.rag_evidence (schema-free JSON). */
interface TaskEvidenceRef {
  chunk_id: string;
  document_id: string;
  title: string;
  publisher: string;
  authority_tier: string;
  doc_type: string;
  doc_version: string;
  section_path: string | null;
  page_number: number | null;
  // §19 of the RAG spec: rank score is fusion rank, NOT semantic confidence —
  // both are stored separately and neither is written into Provenance.confidence.
  rank_score: number;
  semantic_score: number | null;
  lexical_score: number | null;
}

const toRef = (e: Evidence): TaskEvidenceRef => ({
  chunk_id: e.chunkId,
  document_id: e.documentId,
  title: e.title,
  publisher: e.publisher,
  authority_tier: e.authorityTier,
  doc_type: e.docType,
  doc_version: e.docVersion,
  section_path: e.sectionPath,
  page_number: e.pageNumber,
  rank_score: e.rankScore,
  semantic_score: e.semanticScore,
  lexical_score: e.lexicalScore,
});

/** Deterministic English retrieval query from DB-resolved labels only. No LLM. */
function groupQuery(cropLabel: string, tasks: BaselineTask[]): string {
  const stage = tasks[0].stage_name ?? tasks[0].anchor_stage ?? "";
  const names = [...new Set(tasks.map((t) => t.task_name))].slice(0, 2).join(" ");
  return [cropLabel, stage, tasks[0].task_type, names]
    .filter(Boolean)
    .join(" ")
    .slice(0, 200);
}

/** Group key: same task_type within the same stage shares one retrieval. */
const groupKey = (t: BaselineTask): string =>
  `${t.task_type}::${t.stage_key ?? t.anchor_stage ?? "general"}`;

function setStatus(t: BaselineTask, status: TaskEvidenceStatus, refs?: TaskEvidenceRef[]) {
  t.resources = {
    ...(t.resources ?? {}),
    rag_evidence_status: status,
    ...(refs && refs.length ? { rag_evidence: refs } : {}),
  };
}

/**
 * Attach verified corpus evidence to already-generated baseline tasks, in place.
 *
 * Contract (audit acceptance criteria #1/#2/#12):
 *  - evidence attaches only when retrieval is NOT belowThreshold AND the chunk is
 *    farmer-servable; belowThreshold means corpus gap ⇒ NO_EVIDENCE, explicitly;
 *  - attached refs land in task.source_refs (Provenance rows, table "rag_chunks")
 *    and, fully structured, in task.resources.rag_evidence;
 *  - the function mutates evidence metadata ONLY — never task_name, dates, DAS,
 *    quantities, products, instructions, or any other agronomic field;
 *  - any failure degrades to NOT_EVALUATED and never throws to the caller.
 */
export async function attachRagEvidence(
  supabase: SupabaseClient,
  tasks: BaselineTask[],
  ctx: RagEvidenceContext,
): Promise<RagEvidenceSummary> {
  const startedAt = Date.now();
  const summary: RagEvidenceSummary = {
    attempted: true,
    groups_total: 0,
    groups_queried: 0,
    groups_below_threshold: [],
    groups_skipped_budget: [],
    tasks_evidenced: 0,
    tasks_no_evidence: 0,
    tasks_not_evaluated: 0,
    embedding_model: null,
    retrieval_mode: null,
    trace_notes: [],
    elapsed_ms: 0,
  };

  try {
    const cropLabel = ctx.cropLabel || ctx.cropCode;
    // "IN-MH" → "MH"; anything without the prefix passes through unchanged.
    const stateCode = ctx.regionCode
      ? ctx.regionCode.replace(/^IN-/i, "").toUpperCase()
      : null;
    const filters: RagFilters = {
      cropCodes: [ctx.cropCode],
      stateCodes: stateCode ? [stateCode] : null,
      docTypes: null, // no doc-type policy hardcoded here; corpus curation decides
      tenantId: ctx.tenantId,
    };

    // Group tasks (stage × task_type), largest groups first so the budget is
    // spent where it covers the most tasks.
    const groups = new Map<string, BaselineTask[]>();
    for (const t of tasks) {
      const k = groupKey(t);
      const g = groups.get(k);
      if (g) g.push(t);
      else groups.set(k, [t]);
    }
    summary.groups_total = groups.size;
    const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

    for (const [key, groupTasks] of ordered) {
      const overBudget =
        summary.groups_queried >= MAX_GROUPS ||
        Date.now() - startedAt > TIME_BUDGET_MS;
      if (overBudget) {
        summary.groups_skipped_budget.push(key);
        for (const t of groupTasks) setStatus(t, "NOT_EVALUATED");
        summary.tasks_not_evaluated += groupTasks.length;
        continue;
      }

      try {
        const result = await ragRetrieve(
          supabase,
          groupQuery(cropLabel, groupTasks),
          "en", // corpus is English; queries are built from English DB labels
          filters,
          {
            purpose: "SCHEDULE_VALIDATION",
            tenantIdText: ctx.tenantId,
            farmerId: ctx.farmerId,
            maxEvidence: EVIDENCE_PER_GROUP,
          },
        );
        summary.groups_queried += 1;
        summary.retrieval_mode = result.mode;
        if (result.embeddingModel) summary.embedding_model = result.embeddingModel;
        if (result.traceNote) summary.trace_notes.push(`${key}: ${result.traceNote}`);

        const servable = result.belowThreshold
          ? []
          : result.evidence.filter((e) => e.servable);

        if (!servable.length) {
          if (result.belowThreshold) summary.groups_below_threshold.push(key);
          for (const t of groupTasks) setStatus(t, "NO_EVIDENCE");
          summary.tasks_no_evidence += groupTasks.length;
          continue;
        }

        const refs = servable.map(toRef);
        for (const t of groupTasks) {
          setStatus(t, "EVIDENCED", refs);
          for (const e of servable) {
            t.source_refs.push({
              table: "rag_chunks",
              row_id: e.chunkId,
              source: `${e.title} — ${e.publisher}`,
              authority: e.authorityTier,
              // confidence intentionally omitted: rank ≠ confidence (§19)
            });
          }
        }
        summary.tasks_evidenced += groupTasks.length;
      } catch (e) {
        // One group failing must not poison the rest.
        summary.trace_notes.push(`${key}: group_err:${(e as Error).message}`);
        for (const t of groupTasks) setStatus(t, "NOT_EVALUATED");
        summary.tasks_not_evaluated += groupTasks.length;
      }
    }
  } catch (e) {
    summary.attempted = false;
    summary.trace_notes.push(`adapter_err:${(e as Error).message}`);
    // Anything untouched stays NOT_EVALUATED so the gap is visible, not silent.
    for (const t of tasks) {
      const status = (t.resources as Record<string, unknown> | undefined)
        ?.rag_evidence_status;
      if (!status) {
        setStatus(t, "NOT_EVALUATED");
        summary.tasks_not_evaluated += 1;
      }
    }
  }

  summary.elapsed_ms = Date.now() - startedAt;
  return summary;
}
