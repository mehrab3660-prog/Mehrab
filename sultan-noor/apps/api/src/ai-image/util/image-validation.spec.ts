import sharp from 'sharp';
import { validateImageBuffer, isDuplicateHash, scoreTextRelevance } from './image-validation';

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 40, b: 200 } } }).jpeg().toBuffer();
}

describe('validateImageBuffer', () => {
  it('accepts a real, adequately-sized JPEG and returns real metadata sniffed from the bytes', async () => {
    const buf = await makeJpeg(800, 600);
    const result = await validateImageBuffer(buf);
    expect(result.ok).toBe(true);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.format).toBe('jpeg');
    expect(result.contentHash).toHaveLength(64); // sha256 hex
  });

  it('rejects an empty buffer', async () => {
    const result = await validateImageBuffer(Buffer.alloc(0));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('خالی');
  });

  it('rejects a buffer over the size cap', async () => {
    const oversized = Buffer.alloc(15 * 1024 * 1024 + 1);
    const result = await validateImageBuffer(oversized);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('حجم');
  });

  it('rejects garbage bytes that are not a real image (never trusts a claimed type)', async () => {
    const result = await validateImageBuffer(Buffer.from('this is definitely not image data, just text'));
    expect(result.ok).toBe(false);
  });

  it('rejects a file with a spoofed extension whose real bytes are not an image at all', async () => {
    // Simulates "malicious/invalid image input": a non-image payload that
    // might have been uploaded with an image/jpeg content-type or .jpg name.
    const fakePayload = Buffer.from('#!/bin/sh\necho pwned\n');
    const result = await validateImageBuffer(fakePayload);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('rejects an image below the minimum resolution', async () => {
    const tiny = await makeJpeg(50, 50);
    const result = await validateImageBuffer(tiny);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('وضوح');
  });

  it('rejects an image with an unreasonable aspect ratio', async () => {
    const sliver = await makeJpeg(1300, 400); // 3.25:1, both dims clear the min-resolution floor
    const result = await validateImageBuffer(sliver);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('نسبت ابعاد');
  });

  it('rejects an unsupported format (GIF)', async () => {
    const gif = await sharp({ create: { width: 500, height: 500, channels: 3, background: { r: 1, g: 2, b: 3 } } }).gif().toBuffer();
    const result = await validateImageBuffer(gif);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('پشتیبانی نمی');
  });

  it('refuses to decode an image whose pixel count exceeds the decompression-bomb guard', async () => {
    // 8000x8000 = 64M pixels: comfortably under sharp's own generous global
    // default (so this buffer is constructible in the test at all) but well
    // over validateImageBuffer's own 40M-pixel limitInputPixels guard —
    // proving that guard actually rejects, not just sharp's built-in default.
    const bomb = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .png({ compressionLevel: 1 })
      .toBuffer();
    const result = await validateImageBuffer(bomb);
    expect(result.ok).toBe(false);
  }, 20000);

  it('produces identical hashes for identical bytes and different hashes for different images (dedup basis)', async () => {
    const a = await makeJpeg(800, 600);
    const b = await makeJpeg(800, 600);
    const c = await makeJpeg(900, 600);
    const [ra, rb, rc] = await Promise.all([validateImageBuffer(a), validateImageBuffer(b), validateImageBuffer(c)]);
    expect(ra.contentHash).toBe(rb.contentHash);
    expect(ra.contentHash).not.toBe(rc.contentHash);
  });
});

describe('isDuplicateHash', () => {
  it('detects a hash already present in the existing list', () => {
    expect(isDuplicateHash('abc', ['xyz', 'abc'])).toBe(true);
  });
  it('returns false for a hash not present, including against nulls', () => {
    expect(isDuplicateHash('abc', [null, undefined, 'xyz'])).toBe(false);
  });
});

describe('scoreTextRelevance', () => {
  it('scores a candidate whose title matches the product name and brand highly', () => {
    const score = scoreTextRelevance('Schneider C16 miniature circuit breaker', 'کلید مینیاتوری C16', 'Schneider');
    expect(score).toBeGreaterThan(0);
  });

  it('scores completely unrelated text near zero', () => {
    const score = scoreTextRelevance('a photo of a cat sleeping on a sofa', 'کلید مینیاتوری ۱۶ آمپر', 'اشنایدر');
    expect(score).toBe(0);
  });

  it('returns 0 when the product itself has no usable tokens', () => {
    expect(scoreTextRelevance('anything', '', null)).toBe(0);
  });
});
