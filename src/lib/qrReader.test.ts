import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const decode = vi.hoisted(() => vi.fn());
vi.mock('jsqr', () => ({ default: decode }));

import { createQrReader, smoothPixels } from './qrReader';

type Drawn = { width: number; height: number };
let drawn: Drawn | null;
let canvasWorks: boolean;

/** A stand-in for a decoded picture: only its size matters to the reader. */
const picture = (width: number, height: number) => ({ width, height }) as unknown as ImageBitmap;

beforeEach(() => {
  decode.mockReset();
  drawn = null;
  canvasWorks = true;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => {
    if (!canvasWorks) return null;
    return {
      drawImage: (_source: unknown, _x: number, _y: number, width: number, height: number) => { drawn = { width, height }; },
      getImageData: (_x: number, _y: number, width: number, height: number) =>
        ({ data: new Uint8ClampedArray(width * height * 4).fill(200), width, height }),
    } as unknown as CanvasRenderingContext2D;
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe('createQrReader without the browser detector (Chrome on Windows, iPhone, Firefox)', () => {
  it('still gives a reader, which decodes the pixels itself', async () => {
    decode.mockReturnValue({ data: 'KSA1:7K2M-9PQR-4T8X' });
    const read = await createQrReader();
    expect(read).not.toBeNull();
    expect(await read!(picture(640, 480))).toEqual(['KSA1:7K2M-9PQR-4T8X']);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(decode.mock.calls[0].slice(1)).toEqual([640, 480, { inversionAttempts: 'dontInvert' }]);
  });

  it('scales a large picture down before decoding and keeps its shape', async () => {
    decode.mockReturnValue(null);
    const read = await createQrReader();
    await read!(picture(4000, 3000));
    expect(drawn).toEqual({ width: 1024, height: 768 });
  });

  it('tries a frame once more, smoothed, when nothing was found in it', async () => {
    decode.mockReturnValueOnce(null).mockReturnValueOnce({ data: 'KSA1:AAAA-BBBB-CCCC' });
    const read = await createQrReader();
    expect(await read!(picture(320, 240))).toEqual(['KSA1:AAAA-BBBB-CCCC']);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(decode.mock.calls[1][0]).not.toBe(decode.mock.calls[0][0]);
  });

  it('answers with nothing for a frame without a code, and for a video that has no picture yet', async () => {
    decode.mockReturnValue(null);
    const read = await createQrReader();
    expect(await read!(picture(320, 240))).toEqual([]);
    expect(await read!(document.createElement('video'))).toEqual([]);
  });

  it('gives no reader only where a page cannot draw to a canvas', async () => {
    canvasWorks = false;
    expect(await createQrReader()).toBeNull();
  });
});

describe('createQrReader with the browser detector (Chrome on Android)', () => {
  const install = (formats: string[], detect = vi.fn(async () => [{ rawValue: 'KSA1:7K2M-9PQR-4T8X' }, { rawValue: '' }])) => {
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      static getSupportedFormats = async () => formats;
      detect = detect;
    };
    return detect;
  };

  it('uses the detector and never loads the software decoder', async () => {
    const detect = install(['qr_code', 'ean_13']);
    const read = await createQrReader();
    expect(await read!(picture(640, 480))).toEqual(['KSA1:7K2M-9PQR-4T8X']);
    expect(detect).toHaveBeenCalledTimes(1);
    expect(decode).not.toHaveBeenCalled();
  });

  it('falls back to the software decoder when the detector cannot read QR codes', async () => {
    install(['ean_13']);
    decode.mockReturnValue({ data: 'KSA1:7K2M-9PQR-4T8X' });
    const read = await createQrReader();
    expect(await read!(picture(640, 480))).toEqual(['KSA1:7K2M-9PQR-4T8X']);
    expect(decode).toHaveBeenCalled();
  });
});

describe('smoothPixels', () => {
  it('replaces each pixel by the mean of its 3×3 neighbourhood, as grey', () => {
    // 3×3 picture, white with one black pixel in the middle
    const data = new Uint8ClampedArray(9 * 4).fill(255);
    data[4 * 4] = data[4 * 4 + 1] = data[4 * 4 + 2] = 0;
    const out = smoothPixels(data, 3, 3);
    expect(out.length).toBe(data.length);
    expect(out[4 * 4]).toBe(Math.round((8 * 255) / 9));          // centre: 8 white + 1 black
    expect(out[0]).toBe(Math.round((8 * 255) / 9));              // corner: edges repeat, the black pixel counts once
    expect([out[4 * 4 + 1], out[4 * 4 + 2], out[4 * 4 + 3]]).toEqual([out[4 * 4], out[4 * 4], 255]);
    expect(Array.from(data.slice(16, 19))).toEqual([0, 0, 0]);   // the input is left as it was
  });
});
