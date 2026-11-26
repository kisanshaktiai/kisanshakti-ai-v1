// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: supabase/functions/_shared/ocrProvider.ts
//
// CHANGE LOG
// 2026-11-26 — RAG OCR: optical character recognition behind the same
//   replaceable-provider shape as embeddingProvider.ts / rerankProvider.ts.
//   Ingestion depends only on the OcrProvider interface; nothing outside this
//   file calls an OCR API.
//
//   Why an external engine: an edge function has 2 s of CPU and 256 MB per
//   request (Supabase limits, read 2026-11-26), and plain text extraction of a
//   large PDF already ends in WORKER_RESOURCE_LIMIT. Rasterising and
//   recognising pages in-process is not possible there. The provider below is
//   given a short-lived signed URL of the stored file and a list of pages, so
//   this function never renders a page and never holds the file for OCR —
//   the cost is network wait, which does not count against CPU.
//
//   Current provider: Mistral OCR (POST /v1/ocr). Request and response fields
//   used here are the documented ones: `document` (document_url | image_url),
//   `pages` (0-indexed), `table_format`, `confidence_scores_granularity:'page'`
//   → pages[].index, pages[].markdown,
//   pages[].confidence_scores.{average,minimum}_page_confidence_score.
//   Confidence is whatever the engine reports; when it reports none the value
//   is null — it is never estimated here.
//   To swap engines: implement the interface, change getOcrProvider().

export type OcrDocumentKind = 'pdf' | 'image';

export interface OcrPageResult {
  /** 1-based page number in the source document */
  pageNumber: number;
  /** recognised text in reading order; tables as markdown rows */
  text: string;
  /** engine-reported average confidence for the page in [0, 1], or null when not reported */
  confidence: number | null;
  /** engine-reported minimum confidence on the page in [0, 1], or null when not reported */
  minConfidence: number | null;
}

export interface OcrProvider {
  /**
   * Recognise the given pages of the document behind `signedUrl`.
   * `pageNumbers` are 1-based; ignored for images (always one page).
   * Returns one entry per page the engine answered for — a requested page
   * that is missing from the result was not processed and must be retried.
   */
  recognize(signedUrl: string, kind: OcrDocumentKind, pageNumbers: number[]): Promise<OcrPageResult[]>;
  /** provider/model string recorded with every page and chunk */
  version(): string;
  available(): boolean;
}

const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1/ocr';
const TIMEOUT_MS = 90_000;

function unitInterval(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

class MistralOcrProvider implements OcrProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    // SECURITY (§41): read server-side only; never log; never echo in errors.
    this.apiKey = Deno.env.get('RAG_OCR_API_KEY') || '';
    this.model = Deno.env.get('RAG_OCR_MODEL') || 'mistral-ocr-latest';
  }

  available(): boolean {
    return this.apiKey.trim().length > 0;
  }
  version(): string {
    return `mistral/${this.model}`;
  }

  async recognize(signedUrl: string, kind: OcrDocumentKind, pageNumbers: number[]): Promise<OcrPageResult[]> {
    if (!this.available()) throw new Error('OCR_PROVIDER_UNCONFIGURED');
    const body: Record<string, unknown> = {
      model: this.model,
      document: kind === 'image'
        ? { type: 'image_url', image_url: signedUrl }
        : { type: 'document_url', document_url: signedUrl },
      table_format: 'markdown',
      include_image_base64: false,
      confidence_scores_granularity: 'page',
    };
    if (kind === 'pdf') body.pages = pageNumbers.map((p) => p - 1);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(MISTRAL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Do not include response body wholesale — avoid any chance of key echo in logs.
        throw new Error(`OCR_HTTP_${res.status}`);
      }
      const json = await res.json();
      if (!Array.isArray(json?.pages)) throw new Error('OCR_BAD_RESPONSE');
      const out: OcrPageResult[] = [];
      for (const p of json.pages) {
        const index = Number(p?.index);
        if (!Number.isInteger(index) || index < 0) continue;
        out.push({
          pageNumber: kind === 'image' ? 1 : index + 1,
          text: typeof p?.markdown === 'string' ? p.markdown : '',
          confidence: unitInterval(p?.confidence_scores?.average_page_confidence_score),
          minConfidence: unitInterval(p?.confidence_scores?.minimum_page_confidence_score),
        });
      }
      return out;
    } finally {
      clearTimeout(t);
    }
  }
}

/** Factory — the single switch point for provider replacement. */
export function getOcrProvider(): OcrProvider {
  return new MistralOcrProvider();
}
