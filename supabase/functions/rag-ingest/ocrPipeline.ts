// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: supabase/functions/rag-ingest/ocrPipeline.ts
//
// CHANGE LOG
// 2026-11-26 — RAG OCR: page-level extraction state for rag-ingest.
//   A document's pages live in rag_pages (one row per page). Native text is
//   tried first; a page with too little text is queued for OCR. OCR runs in
//   small batches across as many invocations as the document needs, so no
//   single request has to finish a large scan inside the edge time limit.
//
//   Guarantees kept here:
//   - Claiming is a conditional UPDATE (status pending → processing), so two
//     invocations never recognise — or pay for — the same page.
//   - A claim left behind by a killed worker is released after CLAIM_STALE_MS.
//   - A page is tried at most MAX_ATTEMPTS times, then marked failed with the
//     engine's error; nothing is dropped silently and nothing is invented.
//   - A page the engine did not answer for goes back to the queue.
//   This module has no knowledge of chunking or embedding and no vocabulary:
//   it only moves pages between states. index.ts finalises the document.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';
import type { OcrDocumentKind, OcrProvider } from '../_shared/ocrProvider.ts';

/** A page whose native text is shorter than this is treated as image-only. */
export const MIN_PAGE_TEXT_CHARS = 40;
/** Pages sent to the engine per request. */
export const OCR_BATCH_PAGES = 8;
export const MAX_ATTEMPTS = 3;
export const CLAIM_STALE_MS = 5 * 60_000;
/** Below this engine-reported page confidence the page is kept for review but not indexed. */
export const MIN_OCR_CONFIDENCE = 0.5;
const SIGNED_URL_TTL_S = 600;

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'tif', 'tiff'] as const;
export const INGESTABLE_EXTENSIONS = ['pdf', ...IMAGE_EXTENSIONS] as const;

export type PageStatus = 'pending' | 'processing' | 'done' | 'empty' | 'low_confidence' | 'failed';
export type ExtractionMethod = 'text' | 'ocr';

export interface PageRow {
  document_id: string;
  tenant_id: string | null;
  page_number: number;
  status: PageStatus;
  extraction_method: ExtractionMethod | null;
  page_text: string | null;
  char_count: number;
  ocr_confidence: number | null;
  ocr_min_confidence: number | null;
  ocr_engine: string | null;
  attempts: number;
  error: string | null;
}

export interface OcrProgress {
  total: number;
  text_pages: number;
  ocr_pages: number;
  pending: number;
  empty: number;
  low_confidence: number;
  failed: number;
  failed_pages: number[];
  low_confidence_pages: number[];
  avg_confidence: number | null;
}

export function fileKind(storagePath: string): { ext: string; kind: OcrDocumentKind | null } {
  const ext = (storagePath.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return { ext, kind: 'pdf' };
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return { ext, kind: 'image' };
  return { ext, kind: null };
}

/** Native-first classification: which pages have a usable text layer, which need OCR. */
export function classifyPages(pages: Array<{ page: number; text: string }>): { textPages: number[]; ocrPages: number[] } {
  const textPages: number[] = [];
  const ocrPages: number[] = [];
  for (const p of pages) (p.text.trim().length >= MIN_PAGE_TEXT_CHARS ? textPages : ocrPages).push(p.page);
  return { textPages, ocrPages };
}

export function summarize(rows: Array<Pick<PageRow, 'page_number' | 'status' | 'extraction_method' | 'ocr_confidence'>>): OcrProgress {
  const by = (s: PageStatus) => rows.filter((r) => r.status === s);
  const conf = rows.filter((r) => r.extraction_method === 'ocr' && r.status === 'done' && r.ocr_confidence != null).map((r) => Number(r.ocr_confidence));
  return {
    total: rows.length,
    text_pages: rows.filter((r) => r.extraction_method === 'text' && r.status === 'done').length,
    ocr_pages: rows.filter((r) => r.extraction_method === 'ocr' && r.status === 'done').length,
    pending: by('pending').length + by('processing').length,
    empty: by('empty').length,
    low_confidence: by('low_confidence').length,
    failed: by('failed').length,
    failed_pages: by('failed').map((r) => r.page_number).sort((a, b) => a - b),
    low_confidence_pages: by('low_confidence').map((r) => r.page_number).sort((a, b) => a - b),
    avg_confidence: conf.length ? Number((conf.reduce((a, b) => a + b, 0) / conf.length).toFixed(4)) : null,
  };
}

export async function loadProgress(supabase: SupabaseClient, documentId: string): Promise<OcrProgress> {
  const { data, error } = await supabase
    .from('rag_pages')
    .select('page_number, status, extraction_method, ocr_confidence')
    .eq('document_id', documentId);
  if (error) throw new Error(`rag_pages read failed: ${error.message}`);
  return summarize((data || []) as PageRow[]);
}

/**
 * Register the pages of a freshly extracted document. Pages already recorded
 * for this document are left as they are (a re-run after a failure keeps the
 * pages that were recognised and paid for); only pages marked failed are put
 * back in the queue.
 */
export async function registerPages(
  supabase: SupabaseClient,
  doc: { id: string; tenant_id: string | null },
  pages: Array<{ page: number; text: string }>,
): Promise<void> {
  const { textPages } = classifyPages(pages);
  const isText = new Set(textPages);
  const rows = pages.map((p) => ({
    document_id: doc.id,
    tenant_id: doc.tenant_id,
    page_number: p.page,
    status: isText.has(p.page) ? 'done' : 'pending',
    extraction_method: isText.has(p.page) ? 'text' : null,
    page_text: isText.has(p.page) ? p.text : null,
    char_count: isText.has(p.page) ? p.text.length : 0,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from('rag_pages')
      .upsert(rows.slice(i, i + 200), { onConflict: 'document_id,page_number', ignoreDuplicates: true });
    if (error) throw new Error(`rag_pages register failed: ${error.message}`);
  }
  const { error: resetErr } = await supabase
    .from('rag_pages')
    .update({ status: 'pending', attempts: 0, error: null, updated_at: new Date().toISOString() })
    .eq('document_id', doc.id)
    .eq('status', 'failed');
  if (resetErr) throw new Error(`rag_pages retry reset failed: ${resetErr.message}`);
}

/** Claim up to OCR_BATCH_PAGES pending pages; returns the page numbers this invocation now owns. */
async function claimBatch(supabase: SupabaseClient, documentId: string): Promise<number[]> {
  // Release claims a dead worker left behind.
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
  await supabase.from('rag_pages')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('document_id', documentId).eq('status', 'processing').lt('updated_at', staleBefore);

  const { data: candidates, error } = await supabase
    .from('rag_pages')
    .select('page_number')
    .eq('document_id', documentId).eq('status', 'pending')
    .order('page_number').limit(OCR_BATCH_PAGES);
  if (error) throw new Error(`rag_pages claim read failed: ${error.message}`);
  const wanted = (candidates || []).map((r: { page_number: number }) => r.page_number);
  if (!wanted.length) return [];

  // The status predicate makes the claim exclusive: a page another invocation
  // took in the meantime no longer matches and is not returned.
  const { data: claimed, error: claimErr } = await supabase
    .from('rag_pages')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('document_id', documentId).eq('status', 'pending').in('page_number', wanted)
    .select('page_number');
  if (claimErr) throw new Error(`rag_pages claim failed: ${claimErr.message}`);
  return (claimed || []).map((r: { page_number: number }) => r.page_number).sort((a: number, b: number) => a - b);
}

async function releaseOrFail(supabase: SupabaseClient, documentId: string, pageNumbers: number[], reason: string): Promise<void> {
  const { data: rows } = await supabase
    .from('rag_pages').select('page_number, attempts')
    .eq('document_id', documentId).in('page_number', pageNumbers);
  for (const r of (rows || []) as Array<{ page_number: number; attempts: number }>) {
    const attempts = (r.attempts ?? 0) + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await supabase.from('rag_pages')
      .update({ status: exhausted ? 'failed' : 'pending', attempts, error: reason, updated_at: new Date().toISOString() })
      .eq('document_id', documentId).eq('page_number', r.page_number);
  }
}

/**
 * Run OCR batches for one document until nothing is pending or the deadline
 * is near. Safe to call repeatedly and concurrently.
 */
export async function runOcr(
  supabase: SupabaseClient,
  provider: OcrProvider,
  doc: { id: string; storagePath: string; bucket: string },
  deadlineAt: number,
): Promise<{ recognised: number; batches: number; lastError: string | null }> {
  const { kind } = fileKind(doc.storagePath);
  if (!kind) throw new Error(`UNSUPPORTED_FILE_TYPE: ${doc.storagePath}`);
  let recognised = 0, batches = 0;
  let lastError: string | null = null;

  const signedUrl = async (): Promise<string> => {
    const { data: signed, error: signErr } = await supabase.storage.from(doc.bucket).createSignedUrl(doc.storagePath, SIGNED_URL_TTL_S);
    if (signErr || !signed?.signedUrl) throw new Error(`SIGNED_URL_FAILED: ${signErr?.message || 'no url'}`);
    return signed.signedUrl;
  };

  /** One engine request for `pages`; writes what came back, returns the pages it did not answer for. */
  const recogniseAndStore = async (pages: number[]): Promise<number[]> => {
    const results = await provider.recognize(await signedUrl(), kind, pages);
    const answered = new Set<number>();
    for (const r of results) {
      if (!pages.includes(r.pageNumber)) continue;
      answered.add(r.pageNumber);
      const text = r.text.trim();
      const status: PageStatus = !text
        ? 'empty'
        : (r.confidence !== null && r.confidence < MIN_OCR_CONFIDENCE) ? 'low_confidence' : 'done';
      const { error: upErr } = await supabase.from('rag_pages').update({
        status, extraction_method: 'ocr', page_text: text || null, char_count: text.length,
        ocr_confidence: r.confidence, ocr_min_confidence: r.minConfidence, ocr_engine: provider.version(),
        error: null, updated_at: new Date().toISOString(),
      }).eq('document_id', doc.id).eq('page_number', r.pageNumber);
      if (upErr) throw new Error(`rag_pages write failed: ${upErr.message}`);
      recognised++;
    }
    return pages.filter((p) => !answered.has(p));
  };
  const fatal = (msg: string) => /UNCONFIGURED|OCR_HTTP_40[13]/.test(msg);

  while (Date.now() < deadlineAt) {
    const claimed = await claimBatch(supabase, doc.id);
    if (!claimed.length) break;
    batches++;
    try {
      const unanswered = await recogniseAndStore(claimed);
      if (unanswered.length) {
        lastError = 'OCR_PAGE_NOT_RETURNED';
        await releaseOrFail(supabase, doc.id, unanswered, lastError);
      }
    } catch (e) {
      lastError = (e as Error).message || String(e);
      // A configuration or authorisation fault will not heal inside this
      // request: put the pages back untouched and stop.
      if (fatal(lastError)) {
        await supabase.from('rag_pages').update({ status: 'pending', error: lastError, updated_at: new Date().toISOString() })
          .eq('document_id', doc.id).in('page_number', claimed);
        break;
      }
      if (claimed.length === 1) {
        await releaseOrFail(supabase, doc.id, claimed, lastError);
        continue;
      }
      // A failed batch says nothing about which page is at fault. Ask for each
      // page on its own, so one unreadable page cannot take its neighbours'
      // attempts with it.
      for (const page of claimed) {
        try {
          const missing = await recogniseAndStore([page]);
          if (missing.length) await releaseOrFail(supabase, doc.id, missing, 'OCR_PAGE_NOT_RETURNED');
        } catch (single) {
          lastError = (single as Error).message || String(single);
          await releaseOrFail(supabase, doc.id, [page], lastError);
        }
      }
    }
  }
  return { recognised, batches, lastError };
}
