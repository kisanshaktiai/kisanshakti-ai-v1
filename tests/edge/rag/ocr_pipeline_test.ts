// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: tests/edge/rag/ocr_pipeline_test.ts
//
// CHANGE LOG
// 2026-11-26 — RAG OCR pipeline behaviour (rag-ingest/ocrPipeline.ts) against an
//   in-memory rag_pages table and a scripted OCR engine. No network, no keys.
//   Run with: deno test --allow-read tests/edge/rag/ocr_pipeline_test.ts
//   Covers: digital / scanned / mixed PDFs, images, multilingual text, empty
//   pages, low confidence, engine failure and retry limit, pages the engine
//   did not return, duplicate processing (re-register, concurrent runs), large
//   documents across several invocations, tenant carry-over.

import {
  classifyPages, fileKind, loadProgress, registerPages, runOcr,
  MAX_ATTEMPTS, MIN_OCR_CONFIDENCE, MIN_PAGE_TEXT_CHARS, OCR_BATCH_PAGES,
} from "../../../supabase/functions/rag-ingest/ocrPipeline.ts";
import type { OcrPageResult, OcrProvider } from "../../../supabase/functions/_shared/ocrProvider.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}: expected ${e}, got ${a}`);
}

// ── In-memory stand-in for the supabase-js calls ocrPipeline.ts makes ────────
type Row = Record<string, any>;
class FakeDb {
  rows: Row[] = [];
  signedUrlCalls = 0;
  from(_table: string) { return new Query(this); }
  storage = {
    from: (_bucket: string) => ({
      createSignedUrl: async (path: string, _ttl: number) => {
        this.signedUrlCalls++;
        return { data: { signedUrl: `https://storage.invalid/${path}?sig=1` }, error: null };
      },
    }),
  };
}
class Query {
  private filters: Array<(r: Row) => boolean> = [];
  private op: "select" | "update" | "upsert" = "select";
  private patch: Row = {};
  private upsertRows: Row[] = [];
  private returning = false;
  private orderKey: string | null = null;
  private max = Infinity;
  private db: FakeDb;
  constructor(db: FakeDb) { this.db = db; }
  select(_cols?: string) { if (this.op !== "select") this.returning = true; return this; }
  update(patch: Row) { this.op = "update"; this.patch = patch; return this; }
  upsert(rows: Row[], _opts?: unknown) { this.op = "upsert"; this.upsertRows = rows; return this; }
  eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this; }
  in(k: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[k])); return this; }
  lt(k: string, v: string) { this.filters.push((r) => String(r[k]) < v); return this; }
  order(k: string) { this.orderKey = k; return this; }
  limit(n: number) { this.max = n; return this; }
  then(resolve: (v: { data: Row[] | null; error: null }) => void) { resolve(this.run()); }
  private run(): { data: Row[] | null; error: null } {
    if (this.op === "upsert") {
      for (const r of this.upsertRows) {
        const exists = this.db.rows.some((x) => x.document_id === r.document_id && x.page_number === r.page_number);
        if (!exists) this.db.rows.push({ attempts: 0, error: null, ocr_confidence: null, ocr_min_confidence: null, ocr_engine: null, updated_at: new Date().toISOString(), ...r });
      }
      return { data: null, error: null };
    }
    let hit = this.db.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.orderKey) hit = [...hit].sort((a, b) => a[this.orderKey!] - b[this.orderKey!]);
    hit = hit.slice(0, this.max);
    if (this.op === "update") {
      for (const r of hit) Object.assign(r, this.patch);
      return { data: this.returning ? hit.map((r) => ({ ...r })) : null, error: null };
    }
    return { data: hit.map((r) => ({ ...r })), error: null };
  }
}

// ── Scripted OCR engine ───────────────────────────────────────────────────────
class FakeOcr implements OcrProvider {
  calls: number[][] = [];
  seen = new Map<number, number>();
  private script: (page: number, call: number) => OcrPageResult | "throw" | "skip";
  private delayMs: number;
  constructor(script: (page: number, call: number) => OcrPageResult | "throw" | "skip", delayMs = 0) { this.script = script; this.delayMs = delayMs; }
  available() { return true; }
  version() { return "fake/ocr-test"; }
  async recognize(_url: string, _kind: "pdf" | "image", pages: number[]): Promise<OcrPageResult[]> {
    this.calls.push([...pages]);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const out: OcrPageResult[] = [];
    for (const p of pages) {
      const n = (this.seen.get(p) ?? 0) + 1;
      this.seen.set(p, n);
      const r = this.script(p, n);
      if (r === "throw") throw new Error("OCR_HTTP_503");
      if (r !== "skip") out.push(r);
    }
    return out;
  }
}
const ok = (page: number, text = `recognised text of page ${page}`, confidence: number | null = 0.93): OcrPageResult =>
  ({ pageNumber: page, text, confidence, minConfidence: confidence });

const LONG = "x".repeat(MIN_PAGE_TEXT_CHARS + 10);
const DOC = { id: "doc-1", storagePath: "source/topic/2026/file__v1__en__x.pdf", bucket: "rag-documents" };
const far = () => Date.now() + 60_000;

// ── Classification ────────────────────────────────────────────────────────────
Deno.test("digital PDF: every page has a text layer, nothing is queued for OCR", () => {
  const c = classifyPages([{ page: 1, text: LONG }, { page: 2, text: LONG }]);
  assertEquals(c, { textPages: [1, 2], ocrPages: [] }, "digital classification");
});
Deno.test("scanned PDF: no page has a text layer, all are queued", () => {
  const c = classifyPages([{ page: 1, text: "" }, { page: 2, text: "  \n " }]);
  assertEquals(c, { textPages: [], ocrPages: [1, 2] }, "scanned classification");
});
Deno.test("mixed PDF: only the image pages are queued", () => {
  const c = classifyPages([{ page: 1, text: LONG }, { page: 2, text: "3" }, { page: 3, text: LONG }, { page: 4, text: "" }]);
  assertEquals(c, { textPages: [1, 3], ocrPages: [2, 4] }, "mixed classification");
});
Deno.test("file kinds: pdf and the image formats are accepted, others are not", () => {
  assertEquals(fileKind("a/b/c.PDF").kind, "pdf", "pdf");
  for (const e of ["png", "jpg", "jpeg", "tif", "tiff"]) assertEquals(fileKind(`a/b.${e}`).kind, "image", e);
  for (const e of ["md", "txt", "docx", "exe"]) assertEquals(fileKind(`a/b.${e}`).kind, null, e);
});

// ── Mixed document end to end ─────────────────────────────────────────────────
Deno.test("mixed PDF: digital pages keep native text, image pages are recognised, engine sees only image pages", async () => {
  const db = new FakeDb();
  await registerPages(db as any, { id: DOC.id, tenant_id: "tenant-A" }, [
    { page: 1, text: LONG }, { page: 2, text: "" }, { page: 3, text: LONG }, { page: 4, text: "" },
  ]);
  const ocr = new FakeOcr((p) => ok(p));
  const run = await runOcr(db as any, ocr, DOC, far());
  assertEquals(ocr.calls, [[2, 4]], "engine called once with the image pages only");
  assertEquals(run.recognised, 2, "two pages recognised");
  const p = await loadProgress(db as any, DOC.id);
  assertEquals([p.total, p.text_pages, p.ocr_pages, p.pending, p.failed], [4, 2, 2, 0, 0], "progress");
  const byPage = new Map(db.rows.map((r) => [r.page_number, r]));
  assertEquals(byPage.get(1).extraction_method, "text", "page 1 method");
  assertEquals(byPage.get(2).extraction_method, "ocr", "page 2 method");
  assertEquals(byPage.get(2).ocr_engine, "fake/ocr-test", "engine recorded");
  assertEquals(byPage.get(2).ocr_confidence, 0.93, "confidence recorded as reported");
  assert(db.rows.every((r) => r.tenant_id === "tenant-A"), "every page row carries the document's tenant");
});

// ── Images ────────────────────────────────────────────────────────────────────
Deno.test("image: one page, recognised through the image route", async () => {
  const db = new FakeDb();
  const img = { ...DOC, id: "img-1", storagePath: "source/topic/2026/label__v1__en__x.jpg" };
  await registerPages(db as any, { id: img.id, tenant_id: null }, [{ page: 1, text: "" }]);
  let kindSeen = "";
  const ocr = new FakeOcr((p) => ok(p, "| Nutrient | Dose |\n| --- | --- |\n| N | 25 |"));
  const orig = ocr.recognize.bind(ocr);
  ocr.recognize = (u, k, pages) => { kindSeen = k; return orig(u, k, pages); };
  await runOcr(db as any, ocr, img, far());
  assertEquals(kindSeen, "image", "image kind passed to the engine");
  assertEquals(db.rows[0].status, "done", "image page done");
  assert(String(db.rows[0].page_text).includes("| N | 25 |"), "table rows preserved as returned");
});

// ── Multilingual ──────────────────────────────────────────────────────────────
Deno.test("multilingual: Devanagari text is stored exactly as the engine returned it", async () => {
  const db = new FakeDb();
  const hi = "सोयाबीन की बुवाई के लिए बीज दर ६५ किलो प्रति हेक्टेयर रखें।";
  const mr = "सोयाबीन पेरणीसाठी बियाण्याचे प्रमाण हेक्टरी ६५ किलो ठेवावे.";
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, [{ page: 1, text: "" }, { page: 2, text: "" }]);
  await runOcr(db as any, new FakeOcr((p) => ok(p, p === 1 ? hi : mr)), DOC, far());
  assertEquals(db.rows.find((r) => r.page_number === 1)!.page_text, hi, "Hindi text unchanged");
  assertEquals(db.rows.find((r) => r.page_number === 2)!.page_text, mr, "Marathi text unchanged");
});

// ── Empty and low-confidence pages ────────────────────────────────────────────
Deno.test("empty page: recorded as empty, not as a failure and not as text", async () => {
  const db = new FakeDb();
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, [{ page: 1, text: "" }, { page: 2, text: "" }]);
  await runOcr(db as any, new FakeOcr((p) => ok(p, p === 1 ? "   " : "real text")), DOC, far());
  const p = await loadProgress(db as any, DOC.id);
  assertEquals([p.empty, p.ocr_pages, p.failed, p.pending], [1, 1, 0, 0], "empty accounting");
  assertEquals(db.rows.find((r) => r.page_number === 1)!.page_text, null, "no text stored for an empty page");
});
Deno.test("low confidence: page is held back and listed; a null confidence is not treated as low", async () => {
  const db = new FakeDb();
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, [{ page: 1, text: "" }, { page: 2, text: "" }, { page: 3, text: "" }]);
  const ocr = new FakeOcr((p) => p === 1 ? ok(p, "smudged", MIN_OCR_CONFIDENCE - 0.1) : p === 2 ? ok(p, "clear", null) : ok(p, "clear", 0.99));
  await runOcr(db as any, ocr, DOC, far());
  const p = await loadProgress(db as any, DOC.id);
  assertEquals(p.low_confidence_pages, [1], "page 1 held back");
  assertEquals(p.ocr_pages, 2, "pages 2 and 3 usable");
  assertEquals(db.rows.find((r) => r.page_number === 2)!.ocr_confidence, null, "unreported confidence stays null");
  assertEquals(p.avg_confidence, 0.99, "average uses reported confidences only");
});

// ── Failure, retry and the retry limit ────────────────────────────────────────
Deno.test("engine failure: pages are retried, then marked failed with the reason after the attempt limit", async () => {
  const db = new FakeDb();
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, [{ page: 1, text: "" }]);
  const ocr = new FakeOcr(() => "throw");
  const run = await runOcr(db as any, ocr, DOC, far());
  assertEquals(ocr.calls.length, MAX_ATTEMPTS, "tried exactly MAX_ATTEMPTS times");
  assertEquals(db.rows[0].status, "failed", "marked failed");
  assertEquals(db.rows[0].error, "OCR_HTTP_503", "reason recorded");
  assertEquals(run.lastError, "OCR_HTTP_503", "reason reported");
  assertEquals(db.rows[0].page_text, null, "no text invented for a failed page");
});
Deno.test("transient failure: a page that fails once is recognised on the next attempt", async () => {
  const db = new FakeDb();
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, [{ page: 1, text: "" }]);
  await runOcr(db as any, new FakeOcr((p, call) => call === 1 ? "throw" : ok(p)), DOC, far());
  assertEquals([db.rows[0].status, db.rows[0].attempts], ["done", 1], "recovered after one failed attempt");
});
Deno.test("page not returned by the engine goes back to the queue instead of being counted as read", async () => {
  const db = new FakeDb();
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, [{ page: 1, text: "" }, { page: 2, text: "" }]);
  const ocr = new FakeOcr((p, call) => p === 2 && call === 1 ? "skip" : ok(p));
  await runOcr(db as any, ocr, DOC, far());
  assertEquals(ocr.calls, [[1, 2], [2]], "missing page requested again, answered page not");
  assert(db.rows.every((r) => r.status === "done"), "both pages done");
});
Deno.test("one unreadable page in a batch does not fail its neighbours", async () => {
  const db = new FakeDb();
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, [{ page: 1, text: "" }, { page: 2, text: "" }, { page: 3, text: "" }]);
  const ocr = new FakeOcr((p) => p === 2 ? "throw" : ok(p));
  await runOcr(db as any, ocr, DOC, far());
  const byPage = new Map(db.rows.map((r) => [r.page_number, r.status]));
  assertEquals([byPage.get(1), byPage.get(2), byPage.get(3)], ["done", "failed", "done"], "only the bad page fails");
});
Deno.test("authorisation failure stops the run at once (no retry storm)", async () => {
  const db = new FakeDb();
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, [{ page: 1, text: "" }]);
  const ocr = new FakeOcr(() => "throw");
  ocr.recognize = async () => { ocr.calls.push([1]); throw new Error("OCR_HTTP_401"); };
  await runOcr(db as any, ocr, DOC, far());
  assertEquals(ocr.calls.length, 1, "one call only");
  assertEquals([db.rows[0].status, db.rows[0].attempts], ["pending", 0], "page stays queued, no attempt spent, for when the key is fixed");
});

// ── Duplicate-processing protection ───────────────────────────────────────────
Deno.test("re-registering a document keeps recognised pages and only re-queues failed ones", async () => {
  const db = new FakeDb();
  const pages = [{ page: 1, text: "" }, { page: 2, text: "" }];
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, pages);
  await runOcr(db as any, new FakeOcr((p) => p === 2 ? "throw" : ok(p)), DOC, far());
  assertEquals(db.rows.map((r) => r.status).sort(), ["done", "failed"], "one done, one failed");
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, pages);
  assertEquals(db.rows.length, 2, "no duplicate page rows");
  const second = new FakeOcr((p) => ok(p));
  await runOcr(db as any, second, DOC, far());
  assertEquals(second.calls, [[2]], "only the failed page is recognised again");
});
Deno.test("two concurrent runs never recognise the same page twice", async () => {
  const db = new FakeDb();
  const n = OCR_BATCH_PAGES * 3;
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, Array.from({ length: n }, (_, i) => ({ page: i + 1, text: "" })));
  const a = new FakeOcr((p) => ok(p), 5), b = new FakeOcr((p) => ok(p), 5);
  await Promise.all([runOcr(db as any, a, DOC, far()), runOcr(db as any, b, DOC, far())]);
  const all = [...a.calls.flat(), ...b.calls.flat()];
  assertEquals(all.length, n, "every page requested exactly once in total");
  assertEquals(new Set(all).size, n, "no page requested twice");
});

// ── Large documents ───────────────────────────────────────────────────────────
Deno.test("large scan: pages go to the engine in bounded batches", async () => {
  const db = new FakeDb();
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, Array.from({ length: 100 }, (_, i) => ({ page: i + 1, text: "" })));
  const ocr = new FakeOcr((p) => ok(p));
  await runOcr(db as any, ocr, DOC, far());
  assert(ocr.calls.every((c) => c.length <= OCR_BATCH_PAGES), "no batch exceeds OCR_BATCH_PAGES");
  assertEquals(ocr.calls.length, Math.ceil(100 / OCR_BATCH_PAGES), "batch count");
  assertEquals((await loadProgress(db as any, DOC.id)).ocr_pages, 100, "all pages recognised");
});
Deno.test("large scan: a run stops at its deadline and a later run finishes the rest", async () => {
  const db = new FakeDb();
  await registerPages(db as any, { id: DOC.id, tenant_id: null }, Array.from({ length: 40 }, (_, i) => ({ page: i + 1, text: "" })));
  const first = new FakeOcr((p) => ok(p), 30);
  await runOcr(db as any, first, DOC, Date.now() + 45);
  const mid = await loadProgress(db as any, DOC.id);
  assert(mid.pending > 0 && mid.ocr_pages > 0, `first run is partial (done ${mid.ocr_pages}, pending ${mid.pending})`);
  const second = new FakeOcr((p) => ok(p));
  await runOcr(db as any, second, DOC, far());
  const end = await loadProgress(db as any, DOC.id);
  assertEquals([end.ocr_pages, end.pending], [40, 0], "second run completes the document");
  const overlap = first.calls.flat().filter((p) => second.calls.flat().includes(p));
  assertEquals(overlap, [], "no page paid for twice across runs");
});
