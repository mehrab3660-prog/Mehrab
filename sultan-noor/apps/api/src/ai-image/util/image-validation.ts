import type { Metadata } from 'sharp';
import { createHash } from 'crypto';
import { loadSharp } from './sharp-loader';

export interface ImageValidationResult {
  ok: boolean;
  reason?: string;
  width?: number;
  height?: number;
  format?: string;
  fileSizeBytes?: number;
  contentHash?: string;
}

const MAX_BYTES = 15 * 1024 * 1024;
const MIN_WIDTH = 400;
const MIN_HEIGHT = 400;
// Guards against decompression bombs (a tiny file that decodes to a huge
// pixel buffer) — sharp refuses to even decode past this pixel count.
const MAX_INPUT_PIXELS = 40_000_000;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const MIN_ASPECT_RATIO = 0.4;
const MAX_ASPECT_RATIO = 2.5;

// Sniffs the real format/dimensions from the actual bytes (sharp reads
// magic numbers, not the filename/Content-Type header) and rejects anything
// too small, too oddly-shaped, unsupported, or that fails to decode safely.
// This is the single gate every candidate image — downloaded, generated, or
// manually uploaded — must pass before it can become a ProductAiDraftImage.
export async function validateImageBuffer(buffer: Buffer): Promise<ImageValidationResult> {
  if (!buffer || buffer.length === 0) return { ok: false, reason: 'فایل خالی است' };
  if (buffer.length > MAX_BYTES) return { ok: false, reason: 'حجم فایل بیش از حد مجاز است (حداکثر ۱۵ مگابایت)' };

  let metadata: Metadata;
  try {
    const sharp = loadSharp();
    metadata = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    return { ok: false, reason: 'فایل یک تصویر معتبر نیست یا قابل رمزگشایی ایمن نیست' };
  }

  const { width, height, format } = metadata;
  if (!width || !height || !format) return { ok: false, reason: 'ابعاد یا فرمت تصویر قابل تشخیص نیست' };
  if (!ALLOWED_FORMATS.has(format)) return { ok: false, reason: `فرمت «${format}» پشتیبانی نمی‌شود` };
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return { ok: false, reason: `وضوح تصویر بسیار پایین است (حداقل ${MIN_WIDTH}×${MIN_HEIGHT})` };
  }

  const aspectRatio = width / height;
  if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
    return { ok: false, reason: 'نسبت ابعاد تصویر برای نمایش محصول نامتعارف است' };
  }

  return {
    ok: true,
    width,
    height,
    format,
    fileSizeBytes: buffer.length,
    contentHash: createHash('sha256').update(buffer).digest('hex'),
  };
}

export function isDuplicateHash(hash: string, existingHashes: readonly (string | null | undefined)[]): boolean {
  return existingHashes.includes(hash);
}

// Cheap, honest text-overlap heuristic — not a vision model. It cannot
// confirm an image actually depicts the requested product, only that the
// candidate's own title/description text plausibly refers to it. Documented
// as a known limitation: true visual matching is out of scope for Sprint 2.
export function scoreTextRelevance(candidateText: string, productName: string, brandName?: string | null): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);

  const targetTokens = new Set([...normalize(productName), ...(brandName ? normalize(brandName) : [])]);
  if (targetTokens.size === 0) return 0;

  const candidateTokens = new Set(normalize(candidateText));
  let matches = 0;
  for (const t of targetTokens) if (candidateTokens.has(t)) matches++;

  return Math.min(1, matches / targetTokens.size);
}
