/**
 * rag-ingest — RAG corpus ingestion (master prompt §10–§13).
 *
 * Flow: Storage PDF → registration → hash/dedupe → extraction → validation
 *       → heading-aware chunking → entity tagging → (optional) embedding
 *       → storage → audit.
 *
 * Idempotent: same file (content hash) is never ingested twice (§10).
 * Extraction failure marks processing_status='failed' — never silent empty
 * chunks (§11). Scanned PDFs are detected and marked 'failed' with an OCR
 * note; OCR is NOT implemented (honest limitation, §11).
 *
 * Actions (POST JSON body):
 *  { action: 'ingest', storagePath, sourceCode, title, docVersion?,
 *    language?, stateCodes?, cropCodes?, docType?, validFrom?, validUntil?,
 *    publicationDate?, tenantId?, embed? }
 *  { action: 'backfill_embeddings', documentId? , maxChunks? }
 *
 * Admin/ops-triggered function (service context). Not farmer-facing.
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
const MIN_DOC_TEXT_CHARS = 200;   // below this on a multi-page PDF ⇒ scanned/failed

// ── Heading heuristics: numbered ("4.2 ..."), SHORT ALL-CAPS, or Devanagari-short lines
const NUMBERED_HEADING = /^\s*(\d+(?:\.\d+)*)[.)]?\s+(.{3,80})$/;
const CAPS_HEADING = /^[A-Z][A-Z0-9 \-:&()]{4,60}$/;

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

interface RawChunk {
  text: string;
  sectionPath: string | null;
  pageNumber: number;
  isTable: boolean;
}

/** Heading-aware accumulation chunker (§12): splits on detected headings and
 *  paragraph boundaries, targets CHUNK_TARGET_CHARS, keeps section provenance. */
function chunkPages(pages: PageText[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  let currentSection: string | null = null;
  let buf = '';
  let bufPage = pages[0]?.page ?? 1;

  const flush = () => {
    const t = buf.trim();
    if (t.length >= 80) {
      // crude table signal: many aligned number groups / pipe rows
      const isTable = /(\|.+\|)|((\d+[\s]{2,}){3,})/.test(t);
      chunks.push({ text: t, sectionPath: currentSection, pageNumber: bufPage, isTable });
    }
    buf = '';
  };

  for (const { page, text } of pages) {
    const paragraphs = text.split(/\n{2,}|\r\n{2,}/);
    for (const para of paragraphs) {
      const lines = para.split(/\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const numbered = line.match(NUMBERED_HEADING);
        const isHeading =
          (numbered && line.length < 90) ||
          (CAPS_HEADING.test(line) && line.length < 65);
        if (isHeading) {
          flush();
          currentSection = numbered ? `${numbered[1]} ${numbered[2]}`.trim() : line;
          bufPage = page;
          continue;
        }
        if (buf.length === 0) bufPage = page;
        buf += (buf ? ' ' : '') + line;
        if (buf.length >= CHUNK_MAX_CHARS) flush();
      }
      if (buf.length >= CHUNK_TARGET_CHARS) flush();
    }
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

function tagChunk(text: string, dict: EntityDictionaries): { cropCodes: string[]; chemicalNames: string[] } {
  const lower = text.toLowerCase();
  const cropCodes = new Set<string>();
  for (const { code, term } of dict.crops) {
    if (term.length >= 3 && lower.includes(term)) cropCodes.add(code);
  }
  const chemicalNames = new Set<string>();
  for (const chem of dict.chemicals) {
    if (chem.length >= 4 && lower.includes(chem)) chemicalNames.add(chem);
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

    // 3) Hash / dedupe (§10 — idempotent)
    const contentHash = await sha256Hex(buf);
    const { data: dup } = await supabase
      .from('rag_documents')
      .select('id, processing_status, is_active')
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
    const rawChunks = chunkPages(pages);
    if (rawChunks.length === 0) return await fail('CHUNKING_PRODUCED_ZERO_CHUNKS');

    // 7) Entity tagging from SSOT tables (§13)
    const dict = await loadEntityDictionaries(supabase);
    const chunkRows = rawChunks.map((c, i) => {
      const tags = tagChunk(c.text, dict);
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
