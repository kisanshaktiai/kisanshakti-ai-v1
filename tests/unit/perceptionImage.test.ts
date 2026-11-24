/**
 * Inline photo delivery for every vision provider (land scans and General Scan).
 * REPO: kisanshaktiai/kisanshakti-ai-v1   PATH: tests/unit/perceptionImage.test.ts
 */
import { describe, expect, it } from 'vitest';
import { imageDataUrl } from '../../supabase/functions/ai-agriculture-chat/photo/perception-engine';

// Storage returns a Blob; only arrayBuffer() is used (jsdom's Blob lacks it, so a minimal stand-in).
const blobOf = (bytes: Uint8Array) => ({ arrayBuffer: async () => bytes.slice().buffer });
const storage = (result: { data: ReturnType<typeof blobOf> | null; error: { message: string } | null }) => ({
  storage: { from: (bucket: string) => ({ download: async (path: string) => ({ ...result, bucket, path }) }) },
});

describe('imageDataUrl', () => {
  it('returns the stored bytes as a base64 JPEG data URL', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x41]);
    const r = await imageDataUrl(storage({ data: blobOf(bytes), error: null }), 'crop-growth-media', 't/f/l/x/raw.jpg');
    expect(r).toEqual({ ok: true, url: `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}` });
  });

  it('encodes photos larger than one chunk without losing bytes', async () => {
    const bytes = new Uint8Array(0x8000 * 2 + 17).map((_, i) => i % 251);
    const r = await imageDataUrl(storage({ data: blobOf(bytes), error: null }), 'b', 'p');
    expect(r.ok && r.url).toBe(`data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`);
  });

  it('reports a missing object instead of throwing', async () => {
    expect(await imageDataUrl(storage({ data: null, error: { message: 'Object not found' } }), 'b', 'p'))
      .toEqual({ ok: false, detail: 'Object not found' });
  });
});
