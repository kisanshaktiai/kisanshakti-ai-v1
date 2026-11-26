/**
 * qrReader — reads QR codes with the browser's own detector.
 *
 * CHANGE LOG
 * 2026-11-25 — Created (farmer activation, app part).
 *
 * Uses the Shape Detection API (BarcodeDetector), which Chrome on Android and
 * the Android WebView provide. No library is added to the app. Where the
 * detector does not exist (iPhone, some desktop browsers) createQrReader()
 * returns null and the caller offers typing the code only.
 */

/** Reads every QR in a video frame or picture and returns their texts. */
export type QrReader = (source: ImageBitmapSource) => Promise<string[]>;

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

export async function createQrReader(): Promise<QrReader | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const formats = (await Detector.getSupportedFormats?.()) ?? [];
    if (!formats.includes('qr_code')) return null;
    const detector = new Detector({ formats: ['qr_code'] });
    return async (source) => {
      const found = await detector.detect(source);
      return found.map((code) => code.rawValue ?? '').filter((text) => text.length > 0);
    };
  } catch {
    return null;
  }
}
