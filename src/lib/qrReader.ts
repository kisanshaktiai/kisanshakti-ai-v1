/**
 * qrReader — reads QR codes from a camera frame or a picture.
 *
 * CHANGE LOG
 * 2026-11-25 — Created (farmer activation, app part): the browser's own
 *              detector only.
 * 2026-11-26 — Software decoder added as fallback. The browser detector
 *              (Shape Detection API, BarcodeDetector) exists in Chrome on
 *              Android and the Android WebView, but NOT in Chrome on Windows
 *              or Linux, in Firefox, or on iPhone. With the detector alone the
 *              scan button was missing on all of those. Now:
 *                1. the browser's detector, where it reads QR codes;
 *                2. otherwise jsQR, which decodes the pixels itself and is
 *                   downloaded only when the first frame is read. A frame in
 *                   which it finds nothing is tried once more after smoothing:
 *                   measured on generated frames, jsQR reads none of the codes
 *                   whose squares are 6 pixels or less under the pixel noise of
 *                   a dim camera, and all of them after a 3×3 mean.
 *              createQrReader() returns null only where a page cannot draw to
 *              a canvas at all.
 */

/** What a reader is given: a playing camera video, or a decoded picture. */
export type QrSource = HTMLVideoElement | ImageBitmap;

/** Reads the QR codes in one frame or picture and returns their texts. */
export type QrReader = (source: QrSource) => Promise<string[]>;

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

/** Longest side, in pixels, of the image handed to the software decoder. */
const SOFTWARE_MAX_SIDE = 1024;

/**
 * 3×3 mean of the picture's brightness, returned as a grey picture of the same
 * size. It removes pixel noise, at the cost of sharpness: used only as the
 * second attempt on a frame the decoder could not read as it is.
 */
export function smoothPixels(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const count = width * height;
  const grey = new Uint16Array(count);
  for (let i = 0, p = 0; i < count; i++, p += 4) {
    grey[i] = (data[p] * 54 + data[p + 1] * 183 + data[p + 2] * 19) >> 8;
  }
  // Sum of three neighbours along the row, then of three such sums down the column.
  const rows = new Uint16Array(count);
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      rows[i] = grey[x > 0 ? i - 1 : i] + grey[i] + grey[x < width - 1 ? i + 1 : i];
    }
  }
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0, i = 0, p = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++, p += 4) {
      const value = (rows[y > 0 ? i - width : i] + rows[i] + rows[y < height - 1 ? i + width : i]) / 9;
      out[p] = out[p + 1] = out[p + 2] = value;
      out[p + 3] = 255;
    }
  }
  return out;
}

async function browserReader(): Promise<QrReader | null> {
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

function softwareReader(): QrReader | null {
  if (typeof document === 'undefined') return null;
  let context: CanvasRenderingContext2D | null = null;
  const canvas = document.createElement('canvas');
  try {
    context = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    context = null;
  }
  if (!context) return null;
  const pen = context;

  // Downloaded on first use, then kept.
  let decoder: Promise<typeof import('jsqr').default> | null = null;

  return async (source) => {
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!width || !height) return [];

    const scale = Math.min(1, SOFTWARE_MAX_SIDE / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    pen.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = pen.getImageData(0, 0, canvas.width, canvas.height);

    decoder ??= import('jsqr').then((module) => module.default);
    const decode = await decoder;
    // A printed code is dark on light; trying the inverse too would double the work per frame.
    const found =
      decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' }) ??
      decode(smoothPixels(pixels.data, pixels.width, pixels.height), pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
    return found?.data ? [found.data] : [];
  };
}

export async function createQrReader(): Promise<QrReader | null> {
  return (await browserReader()) ?? softwareReader();
}
