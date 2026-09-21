// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: tests/edge/rag/phase0_contracts_test.ts
//
// CHANGE LOG
// 2026-09-21 — RAG Phase 0 regression locks (design v2 S1, S4, S6, R1–R5).
//   Run with: deno test --allow-read --allow-env tests/edge/rag/
//   Same shape as tests/edge/schedule/no-hardcoded-agronomy_test.ts: source
//   contracts read the files; behaviour tests import the pure helpers.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { extractIdentifiers } from "../../../supabase/functions/_shared/queryNormalizer.ts";
import { queryTerms } from "../../../supabase/functions/_shared/ragRetrieval.ts";

const GENERAL_CHAT = "supabase/functions/ai-general-chat/index.ts";
const RETRIEVAL = "supabase/functions/_shared/ragRetrieval.ts";
const NORMALIZER = "supabase/functions/_shared/queryNormalizer.ts";
const INGEST = "supabase/functions/rag-ingest/index.ts";
const RERANK = "supabase/functions/_shared/rerankProvider.ts";

// ── S1: a retrieval failure can never select the ungated prompt ────────────
Deno.test("S1: retrieval catch never resets ragResult to null (no fall-through to GENERAL_LLM_DIRECT)", async () => {
  const src = await Deno.readTextFile(GENERAL_CHAT);
  const body = src.slice(src.indexOf("serve(async"));
  assert(!/ragResult\s*=\s*null\s*;/.test(body), "catch block reintroduced ragResult = null");
  assert(body.includes("GENERAL_RAG_RETRIEVAL_ERROR"), "retrieval error must have its own orchestrator_type");
  assert(body.includes("mode: 'error'"), "catch must produce a mode 'error' RagResult");
});

Deno.test("S1: ragRetrieve surfaces mode 'error' and logs it instead of throwing", async () => {
  const src = await Deno.readTextFile(RETRIEVAL);
  assert(src.includes("retrieval_mode: 'error'"), "error retrievals must be logged with retrieval_mode 'error'");
  assert(src.includes("mode: 'error', belowThreshold: true"), "error result must be belowThreshold");
  assert(src.includes("NO_RETRIEVAL_LEG_RAN"), "no leg ran must be an error, not a corpus gap");
});

Deno.test("S1: fallbacks A and B never run after a retrieval error", async () => {
  const src = await Deno.readTextFile(GENERAL_CHAT);
  const fallbacks = src.match(/if \(ragResult\.belowThreshold && ragResult\.mode !== 'error'/g) || [];
  assertEquals(fallbacks.length, 3, "all three fallbacks (state, topic, original text) must be guarded by mode !== 'error'");
});

// ── S4: topic filter wired end to end ──────────────────────────────────────
Deno.test("S4: topic codes come from rag_topics and reach p_topics", async () => {
  const norm = await Deno.readTextFile(NORMALIZER);
  const ret = await Deno.readTextFile(RETRIEVAL);
  const chat = await Deno.readTextFile(GENERAL_CHAT);
  assert(norm.includes("from('rag_topics')"), "normaliser must load the taxonomy from the table");
  assert(!/const TOPICS = new Set/.test(norm), "the hard-coded topic list must not return");
  assert(ret.includes("p_topics: filters.topicCodes"), "RagFilters.topicCodes must map to p_topics");
  assert(chat.includes("topicCodes: normalized.topicCodes"), "general chat must pass the normaliser's topic codes");
});

// ── R1/R2: BM25 leg, no authority multiplier, diversity, candidates logged ──
Deno.test("R1: lexical leg is the BM25 RPC, not pgroonga raw score", async () => {
  const src = await Deno.readTextFile(RETRIEVAL);
  assert(src.includes("rpc('rag_search_bm25'"), "must call rag_search_bm25");
  assert(!src.includes("rpc('rag_search_fulltext'"), "the raw-TF fulltext leg must be gone");
  assert(!src.includes("function rerankLexical"), "in-process lexical heuristic must be gone");
});

Deno.test("R2: authority is a tie-break, never a score multiplier", async () => {
  const src = await Deno.readTextFile(RETRIEVAL);
  assert(!src.includes("AUTHORITY_BOOST"), "AUTHORITY_BOOST multiplier reintroduced");
  assert(src.includes("AUTHORITY_RANK"), "authority rank table missing");
  assert(src.includes("RELATIVE_TIE"), "tie tolerance missing");
});

Deno.test("R5: every candidate is logged with its gate outcome", async () => {
  const src = await Deno.readTextFile(RETRIEVAL);
  assert(src.includes("candidates: loggedCandidates"), "candidates column must be written");
  for (const g of ["'kept'", "'front_matter'", "'below_gate'", "'diversity'", "'over_cut'"]) assert(src.includes(g), `gate outcome ${g} missing`);
});

Deno.test("Diversity: at most MAX_PER_DOCUMENT per document, and the cut is backfilled", async () => {
  const src = await Deno.readTextFile(RETRIEVAL);
  assert(/const MAX_PER_DOCUMENT = \d+/.test(src));
  assert(src.includes("function applyDiversity"));
});

Deno.test("Reranker is caller opt-in so the schedule path keeps its latency budget", async () => {
  const ret = await Deno.readTextFile(RETRIEVAL);
  const chat = await Deno.readTextFile(GENERAL_CHAT);
  const evidence = await Deno.readTextFile("supabase/functions/ai-smart-schedule/db/rag-evidence.ts");
  const candidates = await Deno.readTextFile("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  assert(ret.includes("if (audit.rerank && candidates.length)"), "rerank must be gated on audit.rerank");
  assert(chat.includes("rerank: true"), "general chat must opt in");
  assert(!evidence.includes("rerank: true") && !candidates.includes("rerank: true"), "schedule path must not opt in");
});

Deno.test("Reranker provider follows the replaceable-provider shape and never logs the key", async () => {
  const src = await Deno.readTextFile(RERANK);
  assert(src.includes("export interface RerankProvider"));
  assert(src.includes("export function getRerankProvider"));
  assert(!src.includes("console.log(") , "no logging in the provider");
});

// ── S6: dedupe predicate is the unique index ───────────────────────────────
Deno.test("S6: ingest dedupes on (source_id, doc_version, content_hash)", async () => {
  const src = await Deno.readTextFile(INGEST);
  const dedupe = src.slice(src.indexOf("// 3) Hash / dedupe"), src.indexOf("// 4) Register document row"));
  assert(dedupe.includes(".eq('source_id', source.id)"), "source_id missing from dedupe predicate");
  assert(dedupe.includes(".eq('doc_version', String(docVersion))"), "doc_version missing from dedupe predicate");
  assert(dedupe.includes(".eq('content_hash', contentHash)"), "content_hash missing from dedupe predicate");
});

// ── Language / crop agnosticism of what Phase 0 added ─────────────────────
/** Code only: comments (older change-log entries name the documents they fixed) are not rules. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`])\/\/.*$/gm, "$1");
}
Deno.test("Phase 0 additions carry no crop or language vocabulary", async () => {
  const rerank = stripComments(await Deno.readTextFile(RERANK));
  const ingestSrc = await Deno.readTextFile(INGEST);
  const ingestNew = stripComments(ingestSrc.slice(0, ingestSrc.indexOf("interface EntityDictionaries")));
  const normPrompt = (await Deno.readTextFile(NORMALIZER)).match(/const SYSTEM = `[\s\S]*?`;/)?.[0] ?? "";
  const cropWords = /\b(soybean|soyabean|rice|paddy|wheat|sugarcane|cotton|maize|groundnut)\b/i;
  assert(!cropWords.test(rerank), "crop word in rerankProvider.ts");
  assert(!cropWords.test(ingestNew), "crop word in the ingest chunking code");
  assert(!cropWords.test(normPrompt), "crop-specific example in the interpreter prompt");
  assert(!/[ऀ-ॿ]/.test(normPrompt), "target-language text in the interpreter prompt");
});

// ── Pure helpers ───────────────────────────────────────────────────────────
Deno.test("extractIdentifiers finds code-shaped tokens in any script and ignores bare numbers", () => {
  assertEquals(extractIdentifiers("kds 726 he kay aahe?"), []);            // lower-case letters + space: not a code shape
  assertEquals(extractIdentifiers("KDS 726 he kay aahe?"), ["KDS 726"]);
  assertEquals(extractIdentifiers("मला JS-335 बद्दल माहिती द्या"), ["JS-335"]);
  assertEquals(extractIdentifiers("Pusa44 and CO 86032 and 25 kg"), ["Pusa44", "CO 86032"]);
  assertEquals(extractIdentifiers("२५ किलो प्रति एकर"), []);
  assertEquals(extractIdentifiers("apply kg25 and 20 ml/ha"), []);        // a unit glued to a number is not a code
});

Deno.test("Schedule path treats a retrieval error as NOT_EVALUATED, never as a corpus gap", async () => {
  const src = await Deno.readTextFile("supabase/functions/ai-smart-schedule/db/rag-evidence.ts");
  assert(src.includes('if (result.mode === "error") throw new Error('), "mode 'error' must route to the group_err handler");
});

Deno.test("rag-eval is registered with the gateway so the sweep-key bearer reaches the function", async () => {
  const cfg = await Deno.readTextFile("supabase/config.toml");
  assert(/\[functions\.rag-eval\]\s*\n\s*verify_jwt = false/.test(cfg), "config.toml must declare [functions.rag-eval] verify_jwt = false");
});

Deno.test("queryTerms keeps script-agnostic tokens, drops one-character noise, caps the count", () => {
  assertEquals(queryTerms("Seed rate for a crop per acre"), ["seed", "rate", "for", "crop", "per", "acre"]);
  assertEquals(queryTerms("बियाणे दर एकरी"), ["बियाणे", "दर", "एकरी"]);
  assertEquals(queryTerms("a b c d").length, 0);
  assertEquals(queryTerms(Array.from({ length: 30 }, (_, i) => `term${i}`).join(" ")).length, 12);
});
