/**
 * rag-ingest — RAG corpus ingestion (master prompt §10–§13).
 *
 * Flow: Storage PDF → registration → hash/dedupe → extraction → validation
 *       → heading-aware chunking → entity tagging → (optional) embedding
 *       → storage → audit.
 *
 * Idempotent: the same file under the same source and version is never
 * ingested twice (§10). Extraction failure marks processing_status='failed' —
 * never silent empty chunks (§11). Scanned PDFs are detected and marked
 * 'failed' with an OCR note; OCR is NOT implemented (honest limitation, §11).
 *
 * Actions (POST JSON body):
 *  { action: 'ingest', storagePath, sourceCode, title, docVersion?,
 *    language?, stateCodes?, cropCodes?, docType?, validFrom?, validUntil?,
 *    publicationDate?, tenantId?, embed? }
 *  { action: 'backfill_embeddings', documentId? , maxChunks? }
 *
 * Admin/ops-triggered function (service context). Not farmer-facing.
 *
 * CHANGE LOG
 * 2026-09-21 — RAG PHASE 0 (design v2 S6, R3, R4):
 *   S6  Dedupe predicate is the unique index (source_id, doc_version,
 *       content_hash). Deduping on content_hash alone mapped the same file
 *       uploaded under a second source, tenant or version onto the first
 *       record and reported "already ingested"; it would also have thrown
 *       PGRST116 once two such records existed. The same bytes under a
 *       different scope now become their own record sharing the storage object.
 *   R4  Running headers that sit INSIDE a line are stripped. The line-based
 *       strip only removes a header that is a line of its own; in the ICAR
 *       e-book (verified live: 136 of 341 chunks still carry
 *       "E-book on '…' Page N") the extractor glues the header onto the first
 *       words of the page, so it survived. stripRunningShingles() finds word
 *       n-grams that repeat at the top or bottom edge of ≥30 % of pages and
 *       removes them wherever they sit in the line. Edge position is what
 *       separates a running header from a layout label that legitimately
 *       repeats mid-page on every variety card.
 *   R3  Table rows and card titles are chunk boundaries of their own:
 *       - a numbered line whose title part is unbalanced ("… CVRC(WB,") or
 *         whose next line continues it is a row, not a heading — the
 *         variety-list document had half of each row in section_path and the
 *         other half in chunk_text, and every row under 80 characters was
 *         dropped outright (64 chunks survived from a multi-hundred-row list);
 *       - a dense run of serially numbered lines is a table: each row (with
 *         its continuation lines) becomes one chunk, minimum ROW_MIN_CHARS,
 *         so an identifier query lands on the row that names it;
 *       - a short line that is an identifier code with an optional
 *         parenthesised name ("Code (Name)", "Title – Name (Code)") is a card
 *         title and starts a new chunk even without a serial number.
 *       All three rules are layout rules; no vocabulary, language or crop
 *       appears in them.
 * 2026-08-27 — CHUNK CROP TAGGING FIXED (verified on the 341-chunk ICAR soybean
 *   book): tagChunk() used a substring test, so "num-ber"→ber (53 chunks),
 *   "ap-pear"→pear (14), "Fig. 8"→fig (28), "p-rice"→rice were tagged and the
 *   crop filter served soybean text to fig / wheat questions. Now: word-boundary
 *   match, figure captions stripped, and when the admin declared crop_codes on
 *   the document (SSOT) a chunk may only carry a subset of those.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';
import { extractText, getDocumentProxy } from 'npm:unpdf';
import { getEmbeddingProvider } from '../_shared/embeddingProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'rag-documents';
const CHUNK_TARGET_CHARS = 1600;  // ≈400 tokens
const CHUNK_MAX_CHARS = 2600;     // ≈650 tokens hard ceiling
const CHUNK_MIN_CHARS = 80;       // prose chunk floor
const ROW_MIN_CHARS = 40;         // a table row is short by nature
const MIN_DOC_TEXT_CHARS = 200;   // below this on a multi-page PDF ⇒ scanned/failed

// ── Running-header shingles: word n-grams repeating at the page edges
const SHINGLE_N = 6;
const PAGE_EDGE_TOKENS = 40;

// ── Heading heuristics: numbered ("4.2 ..."), SHORT ALL-CAPS, or Devanagari-short lines
const NUMBERED_HEADING = /^\s*(\d+(?:\.\d+)*)[.)]?\s+(.{3,80})$/;
const CAPS_HEADING = /^[A-Z][A-Z0-9 \-:&()]{4,60}$/;
// ── Card titles: an identifier code with an optional parenthesised name,
//    with or without a serial ("CoPk 05191 (Pratap Ganna-1)", "8 CO 86032")
const CARD_TITLE = /^(?:\d{1,4}[.)]?\s+)?[A-Z][A-Za-z]{0,7}[-\s]?\d{2,6}[A-Za-z0-9-]*(?:\s*\([^()]{2,60}\))?$/;
// ── "Title – Name (Code)"
const DASH_CARD_TITLE = /^[\p{L}\p{M}\p{N} .'/-]{3,60}\s[–—-]\s[\p{L}\p{M}\p{N} .'/-]{2,40}\s\([A-Za-z0-9 ./-]{2,24}\)$/u;
// ── Table row: serial number, then content
const ROW_START = /^\s*(\d{1,4})[.)]?\s+\S/;
const ROW_RUN_MIN = 3;
const ROW_RUN_MAX_GAP = 3;            // lines between consecutive members
const ROW_RUN_MAX_BETWEEN_CHARS = 300; // text between them: a row's continuation is short, a section's body is not

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface PageText { page: number; text: string }

async function extractPdfPages(buf: ArrayBuffer): Promise<PageText[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages: string[] = Array.isArray(text) ? text : [String(text)];
  return pages.map((t, i) => ({ page: i + 1, text: (t || '').replace(/\u0000/g, '').trim() }));
}

/** Remove running headers/footers: lines repeating on ≥30% of pages (min 3).
 *  Found in validation: 'www.krishijagran.com|Package of Practices-Soyabean N'
 *  on every page inflated retrieval scores and polluted chunk text.
 *  (RESTORED 2026-08-28 — deleted by mistake in 8d440fc "fix issue in rag".) */
function stripRunningLines(pages: PageText[]): PageText[] {
  if (pages.length < 4) return pages;
  const freq = new Map<string, number>();
  for (const p of pages) {
    const seen = new Set<string>();
    for (const raw of p.text.split(/\n/)) {
      const norm = raw.trim().replace(/\d+/g, '#').toLowerCase();
      if (norm.length >= 8 && norm.length <= 120 && !seen.has(norm)) {
        seen.add(norm);
        freq.set(norm, (freq.get(norm) || 0) + 1);
      }
    }
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.3));
  const banned = new Set([...freq.entries()].filter(([, n]) => n >= threshold).map(([k]) => k));
  if (banned.size === 0) return pages;
  return pages.map((p) => ({
    page: p.page,
    text: p.text
      .split(/\n/)
      .filter((l) => !banned.has(l.trim().replace(/\d+/g, '#').toLowerCase()))
      .join('\n'),
  }));
}

function shingleToken(w: string): string {
  return w.toLowerCase().replace(/\d+/g, '#');
}

/**
 * Remove running headers that sit inside a line. A word n-gram that appears
 * within the first or last PAGE_EDGE_TOKENS words of ≥30 % of pages (min 3)
 * is a running header wherever the extractor placed it; the words it covers
 * are dropped from their line and lines left empty are removed. Line structure
 * is preserved for the chunker. The edge requirement keeps card-layout labels
 * that repeat mid-page on purpose.
 */
export function stripRunningShingles(pages: PageText[]): PageText[] {
  if (pages.length < 4) return pages;
  type Tok = { line: number; idx: number; norm: string };
  const tokenise = (text: string): { lines: string[][]; toks: Tok[] } => {
    const lines = text.split(/\n/).map((l) => l.split(/\s+/).filter(Boolean));
    const toks: Tok[] = [];
    lines.forEach((words, line) => words.forEach((w, idx) => toks.push({ line, idx, norm: shingleToken(w) })));
    return { lines, toks };
  };
  const pageToks = pages.map((p) => tokenise(p.text));
  const edgeGrams = (toks: Tok[]): Map<string, number[]> => {
    const grams = new Map<string, number[]>();
    const n = toks.length;
    for (let i = 0; i + SHINGLE_N <= n; i++) {
      const atEdge = i < PAGE_EDGE_TOKENS || i + SHINGLE_N > n - PAGE_EDGE_TOKENS;
      if (!atEdge) continue;
      const key = toks.slice(i, i + SHINGLE_N).map((t) => t.norm).join(' ');
      const starts = grams.get(key) ?? [];
      starts.push(i);
      grams.set(key, starts);
    }
    return grams;
  };
  const perPage = pageToks.map((pt) => edgeGrams(pt.toks));
  const pageCount = new Map<string, number>();
  for (const grams of perPage) for (const key of grams.keys()) pageCount.set(key, (pageCount.get(key) || 0) + 1);
  const threshold = Math.max(3, Math.ceil(pages.length * 0.3));
  const banned = new Set([...pageCount.entries()].filter(([, n]) => n >= threshold).map(([k]) => k));
  if (banned.size === 0) return pages;

  return pages.map((p, pi) => {
    const { lines, toks } = pageToks[pi];
    const drop = new Set<number>();
    for (const [key, starts] of perPage[pi]) {
      if (!banned.has(key)) continue;
      for (const s of starts) for (let j = s; j < s + SHINGLE_N; j++) drop.add(j);
    }
    if (drop.size === 0) return p;
    const keep = lines.map(() => [] as string[]);
    toks.forEach((t, i) => { if (!drop.has(i)) keep[t.line].push(lines[t.line][t.idx]); });
    return { page: p.page, text: keep.filter((ws) => ws.length).map((ws) => ws.join(' ')).join('\n') };
  });
}

interface RawChunk {
  text: string;
  sectionPath: string | null;
  pageNumber: number;
  isTable: boolean;
}

/** Parenthesis balance of a line: >0 means an opening bracket is not closed on this line. */
function unbalancedOpen(s: string): boolean {
  return (s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length;
}
/** A line that plainly carries on the previous one (starts lower-case, or with a closing/joining mark). */
function continuesPrevious(next: string | undefined): boolean {
  if (!next) return false;
  return /^[\p{Ll}),;:]/u.test(next);
}

/**
 * Mark the lines of one page that start a table row. A run is ≥ ROW_RUN_MIN
 * serially numbered lines with non-decreasing serials, at most
 * ROW_RUN_MAX_GAP lines and ROW_RUN_MAX_BETWEEN_CHARS characters between
 * consecutive members. Numbered section headings and card titles are
 * separated by paragraphs of body text and never form a run.
 */
function markRowStarts(lines: string[]): boolean[] {
  const serial = lines.map((l) => { const m = l.match(ROW_START); return m ? Number(m[1]) : null; });
  const isRow = lines.map(() => false);
  let run: number[] = [];
  const close = () => { if (run.length >= ROW_RUN_MIN) for (const i of run) isRow[i] = true; run = []; };
  const between = (a: number, b: number) => lines.slice(a + 1, b).reduce((n, l) => n + l.length, 0);
  for (let i = 0; i < lines.length; i++) {
    if (serial[i] === null) continue;
    const prev = run[run.length - 1];
    if (prev !== undefined && (i - prev > ROW_RUN_MAX_GAP + 1 || between(prev, i) > ROW_RUN_MAX_BETWEEN_CHARS || serial[i]! < serial[prev]!)) close();
    run.push(i);
  }
  close();
  return isRow;
}

/** Heading-aware accumulation chunker (§12): splits on detected headings,
 *  card titles, table rows and paragraph boundaries, targets
 *  CHUNK_TARGET_CHARS, keeps section provenance. */
function chunkPages(pages: PageText[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  let currentSection: string | null = null;
  let buf = '';
  let bufPage = pages[0]?.page ?? 1;
  let bufIsRow = false;

  const flush = () => {
    const t = buf.trim();
    const min = bufIsRow ? ROW_MIN_CHARS : CHUNK_MIN_CHARS;
    if (t.length >= min) {
      // crude table signal: many aligned number groups / pipe rows
      const isTable = bufIsRow || /(\|.+\|)|((\d+[\s]{2,}){3,})/.test(t);
      chunks.push({ text: t, sectionPath: currentSection, pageNumber: bufPage, isTable });
    }
    buf = '';
    bufIsRow = false;
  };

  for (const { page, text } of pages) {
    const lines = text.split(/\n/).map((l) => l.trim());
    const rowStart = markRowStarts(lines);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        // paragraph boundary
        if (!bufIsRow && buf.length >= CHUNK_TARGET_CHARS) flush();
        continue;
      }
      const next = lines[i + 1];

      if (rowStart[i]) {
        flush();
        buf = line; bufPage = page; bufIsRow = true;
        continue;
      }

      const numbered = line.match(NUMBERED_HEADING);
      const titlePart = numbered ? numbered[2] : line;
      const letters = (titlePart.match(/[\p{L}]/gu) || []).length;
      const digits = (titlePart.match(/\d/g) || []).length;
      const letterDominated = letters >= 3 && letters > digits * 2;
      // A "heading" that is cut mid-parenthesis, or that the next line carries
      // on, is a row of a table, not a section title.
      const rowLike = unbalancedOpen(line) || /[,;]$/.test(line) || continuesPrevious(next);
      const isCard = !bufIsRow && line.length < 90 && (CARD_TITLE.test(line) || DASH_CARD_TITLE.test(line));
      const isHeading = isCard || (!rowLike && (
        // Validation fix (RESTORED 2026-08-28, deleted in 8d440fc): reject
        // table rows masquerading as headings — title part must be
        // letter-dominated (reject '6.03 7.8 1294', '3 Potash 60').
        (numbered && line.length < 90 && letterDominated) ||
        (CAPS_HEADING.test(line) && line.length < 65 && letterDominated)));
      if (isHeading) {
        flush();
        currentSection = numbered && !isCard ? `${numbered[1]} ${numbered[2]}`.trim() : line;
        bufPage = page;
        continue;
      }
      if (buf.length === 0) bufPage = page;
      buf += (buf ? ' ' : '') + line;
      if (!bufIsRow && buf.length >= CHUNK_MAX_CHARS) flush();
    }
    if (bufIsRow) flush(); // a row never spans a page
  }
  flush();
  return chunks;
}

interface EntityDictionaries {
  crops: Array<{ code: string; term: string }>;
  chemicals: string[];
}

/** Load entity dictionaries from existing SSOT tables (§13 — no invented metadata). */
async function loadEntityDictionaries(supabase: SupabaseClient): Promise<EntityDictionaries> {
  const crops: Array<{ code: string; term: string }> = [];
  const { data: cropRows } = await supabase.from('crops').select('value, label, label_local');
  for (const r of cropRows || []) {
    if (r.value && r.label) crops.push({ code: r.value, term: String(r.label).toLowerCase() });
    if (r.value && r.label_local) crops.push({ code: r.value, term: String(r.label_local).toLowerCase() });
  }
  const { data: synRows } = await supabase.from('crop_synonyms').select('*').limit(3000);
  for (const r of synRows || []) {
    const code = (r as any).crop_code || (r as any).crop_value || (r as any).value;
    const term = (r as any).synonym || (r as any).term || (r as any).name;
    if (code && term) crops.push({ code: String(code), term: String(term).toLowerCase() });
  }
  const { data: chemRows } = await supabase
    .from('chemical_regulatory_status')
    .select('*')
    .limit(500);
  const chemicals: string[] = [];
  for (const r of chemRows || []) {
    const name = (r as any).chemical_name || (r as any).name || (r as any).chemical;
    if (name) chemicals.push(String(name).toLowerCase());
  }
  return { crops, chemicals };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, Unicode-aware, optional plural "s". */
function wordMatch(term: string, haystackLower: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}s?(?![\\p{L}\\p{N}])`, 'iu').test(haystackLower);
}

/**
 * Tag a chunk with crop / chemical entities.
 *  1. Word-boundary match — never substring ("number" must not yield "ber").
 *  2. Figure captions ("Fig. 8", "Figure 3a") are removed before matching.
 *  3. If the document declares crop_codes (set by the admin at upload = SSOT),
 *     a chunk may only carry a subset of those. A passing mention of wheat
 *     rotation inside a soybean PoP must not make that chunk answer wheat
 *     questions. Documents with no declared crops keep full detection.
 */
function tagChunk(
  text: string,
  dict: EntityDictionaries,
  declaredCropCodes: string[] | null,
): { cropCodes: string[]; chemicalNames: string[] } {
  const lower = text.replace(/\b(?:fig|figure)\.?\s*\d+[a-z]?/gi, ' ').toLowerCase();
  const allowed = declaredCropCodes?.length ? new Set(declaredCropCodes) : null;
  const cropCodes = new Set<string>();
  for (const { code, term } of dict.crops) {
    if (term.length < 3) continue;
    if (allowed && !allowed.has(code)) continue;
    if (wordMatch(term, lower)) cropCodes.add(code);
  }
  const chemicalNames = new Set<string>();
  for (const chem of dict.chemicals) {
    if (chem.length >= 4 && wordMatch(chem, lower)) chemicalNames.add(chem);
  }
  return { cropCodes: [...cropCodes].slice(0, 12), chemicalNames: [...chemicalNames].slice(0, 12) };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'ingest';

    // ────────────────────────────── backfill_embeddings ──────────────────────
    if (action === 'backfill_embeddings') {
      const provider = getEmbeddingProvider();
      if (!provider.available()) return json(400, { error: 'EMBED_PROVIDER_UNCONFIGURED' });

      const maxChunks = Math.min(Number(body.maxChunks) || 288, 960); // quota-safe default
      let q = supabase
        .from('rag_chunks')
        .select('id, chunk_text, document_id')
        .is('embedding', null)
        .eq('is_active', true)
        .limit(maxChunks);
      if (body.documentId) q = q.eq('document_id', body.documentId);
      const { data: rows, error } = await q;
      if (error) return json(500, { error: error.message });
      if (!rows?.length) return json(200, { message: 'No chunks pending embedding', embedded: 0 });

      const vectors = await provider.embedDocuments(rows.map((r) => r.chunk_text));
      let embedded = 0;
      const touchedDocs = new Set<string>();
      for (let i = 0; i < rows.length; i++) {
        const { error: upErr } = await supabase
          .from('rag_chunks')
          .update({ embedding: JSON.stringify(vectors[i]) })
          .eq('id', rows[i].id);
        if (!upErr) { embedded++; touchedDocs.add(rows[i].document_id); }
      }
      // §16: record model provenance on the documents whose chunks were embedded
      for (const docId of touchedDocs) {
        await supabase.from('rag_documents').update({ embedding_model: provider.version() }).eq('id', docId);
      }
      console.log(`📐 [${traceId}] backfill embedded=${embedded} model=${provider.version()}`);
      return json(200, { embedded, model: provider.version(), remainingHint: rows.length === maxChunks });
    }

    // ────────────────────────────────── ingest ───────────────────────────────
    if (action !== 'ingest') return json(400, { error: `Unknown action: ${action}` });

    const {
      storagePath, sourceCode, title,
      docVersion = '1', language = 'en',
      stateCodes = null, cropCodes = null,
      docType = null, validFrom = null, validUntil = null,
      publicationDate = null, tenantId = null, embed = false,
    } = body || {};
    if (!storagePath || !sourceCode || !title) {
      return json(400, { error: 'storagePath, sourceCode and title are required' });
    }

    // 1) Source must exist in the governed registry (§8/§9 — no ungoverned corpus)
    const { data: source, error: srcErr } = await supabase
      .from('rag_source_registry')
      .select('id, doc_type, default_language, state_codes, is_active')
      .eq('source_code', sourceCode)
      .maybeSingle();
    if (srcErr || !source) return json(400, { error: `Source '${sourceCode}' not found in rag_source_registry — register it first` });
    if (!source.is_active) return json(400, { error: `Source '${sourceCode}' is inactive` });

    // 2) Download from Storage (§7 — PDFs live in Storage, never in DB)
    const { data: file, error: dlErr } = await supabase.storage.from(BUCKET).download(storagePath);
    if (dlErr || !file) return json(400, { error: `Storage download failed: ${dlErr?.message || 'not found'} (bucket=${BUCKET}, path=${storagePath})` });
    const buf = await file.arrayBuffer();

    // 3) Hash / dedupe (§10 — idempotent). The predicate IS the unique index
    //    rag_documents(source_id, doc_version, content_hash): the same bytes
    //    under another source or version are a different record.
    const contentHash = await sha256Hex(buf);
    const { data: dup } = await supabase
      .from('rag_documents')
      .select('id, processing_status, is_active')
      .eq('source_id', source.id)
      .eq('doc_version', String(docVersion))
      .eq('content_hash', contentHash)
      .maybeSingle();
    if (dup && dup.processing_status === 'completed') {
      return json(200, { message: 'Duplicate — already ingested', documentId: dup.id, deduplicated: true });
    }

    // 4) Register document row (status machine per §28)
    const docFields = {
      source_id: source.id,
      tenant_id: tenantId,
      title,
      doc_version: String(docVersion),
      content_hash: contentHash,
      language: language || source.default_language,
      doc_type: docType || source.doc_type,
      state_codes: stateCodes ?? source.state_codes,
      crop_codes: cropCodes,
      valid_from: validFrom,
      valid_until: validUntil,
      publication_date: publicationDate,
      file_url: `${BUCKET}/${storagePath}`,
      processing_status: 'parsing',
    };
    let documentId: string;
    if (dup) {
      documentId = dup.id;
      await supabase.from('rag_documents').update({ ...docFields, processing_error: null }).eq('id', documentId);
      await supabase.from('rag_chunks').delete().eq('document_id', documentId); // clean re-run of failed ingest
    } else {
      const { data: created, error: insErr } = await supabase
        .from('rag_documents').insert(docFields).select('id').single();
      if (insErr || !created) return json(500, { error: `Document registration failed: ${insErr?.message}` });
      documentId = created.id;
    }

    const fail = async (msg: string) => {
      await supabase.from('rag_documents')
        .update({ processing_status: 'failed', processing_error: msg }).eq('id', documentId);
      console.error(`❌ [${traceId}] ingest failed doc=${documentId}: ${msg}`);
      return json(422, { error: msg, documentId, processing_status: 'failed' });
    };

    // 5) Extract text per page (§11)
    let pages: PageText[];
    try {
      pages = await extractPdfPages(buf);
    } catch (e) {
      return await fail(`PDF_EXTRACTION_ERROR: ${(e as Error).message}`);
    }
    const totalChars = pages.reduce((n, p) => n + p.text.length, 0);
    if (totalChars < MIN_DOC_TEXT_CHARS) {
      return await fail('SCANNED_OR_EMPTY_PDF: no extractable text layer. OCR required — not implemented; mark for manual handling.');
    }

    // 6) Chunk (§12) + validate
    await supabase.from('rag_documents').update({ processing_status: 'chunking' }).eq('id', documentId);
    const cleanedPages = stripRunningShingles(stripRunningLines(pages));
    const rawChunks = chunkPages(cleanedPages);
    if (rawChunks.length === 0) return await fail('CHUNKING_PRODUCED_ZERO_CHUNKS');

    // 7) Entity tagging from SSOT tables (§13), constrained by the declared crops
    const dict = await loadEntityDictionaries(supabase);
    const declaredCrops: string[] | null = Array.isArray(cropCodes) && cropCodes.length ? cropCodes.map(String) : null;
    const chunkRows = rawChunks.map((c, i) => {
      const tags = tagChunk(c.text, dict, declaredCrops);
      return {
        document_id: documentId,
        tenant_id: tenantId,
        chunk_index: i,
        chunk_text: c.text,
        section_path: c.sectionPath,
        page_number: c.pageNumber,
        language: language || source.default_language,
        crop_codes: tags.cropCodes.length ? tags.cropCodes : null,
        chemical_names: tags.chemicalNames.length ? tags.chemicalNames : null,
        token_count: Math.round(c.text.length / 4),
        is_table: c.isTable,
      };
    });

    // 8) Store chunks (batched inserts)
    for (let i = 0; i < chunkRows.length; i += 200) {
      const { error: cErr } = await supabase.from('rag_chunks').insert(chunkRows.slice(i, i + 200));
      if (cErr) return await fail(`CHUNK_INSERT_FAILED: ${cErr.message}`);
    }

    // 9) Optional inline embedding (Stage 2). Failure here does NOT fail the
    //    document — fulltext retrieval already works; embeddings can backfill.
    let embeddedCount = 0;
    let embedNote = 'skipped';
    if (embed) {
      const provider = getEmbeddingProvider();
      if (provider.available()) {
        try {
          await supabase.from('rag_documents').update({ processing_status: 'embedding' }).eq('id', documentId);
          const vectors = await provider.embedDocuments(chunkRows.map((c) => c.chunk_text));
          const { data: inserted } = await supabase
            .from('rag_chunks').select('id, chunk_index').eq('document_id', documentId).order('chunk_index');
          for (const row of inserted || []) {
            const v = vectors[(row as any).chunk_index];
            if (v) {
              const { error: eErr } = await supabase
                .from('rag_chunks').update({ embedding: JSON.stringify(v) }).eq('id', (row as any).id);
              if (!eErr) embeddedCount++;
            }
          }
          await supabase.from('rag_documents').update({ embedding_model: provider.version() }).eq('id', documentId);
          embedNote = `embedded=${embeddedCount} model=${provider.version()}`;
        } catch (e) {
          embedNote = `embed_deferred:${(e as Error).message}`; // backfill later
        }
      } else {
        embedNote = 'provider_unconfigured — fulltext-only (Stage 1)';
      }
    }

    // 10) Complete + audit summary
    await supabase.from('rag_documents')
      .update({ processing_status: 'completed', chunk_count: chunkRows.length }).eq('id', documentId);

    const sections = new Set(chunkRows.map((c) => c.section_path).filter(Boolean)).size;
    console.log(`✅ [${traceId}] ingested doc=${documentId} pages=${pages.length} chunks=${chunkRows.length} sections=${sections} ${embedNote}`);
    return json(200, {
      documentId,
      pages: pages.length,
      chunks: chunkRows.length,
      sectionsDetected: sections,
      tables: chunkRows.filter((c) => c.is_table).length,
      embedding: embedNote,
      processing_status: 'completed',
    });
  } catch (e) {
    console.error(`[${traceId}] fatal`, (e as Error).message);
    return json(500, { error: 'Internal error', detail: (e as Error).message, trace_id: traceId });
  }
});
