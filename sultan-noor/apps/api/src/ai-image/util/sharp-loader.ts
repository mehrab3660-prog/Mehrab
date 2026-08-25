import type SharpType from 'sharp';

// A statically-imported `sharp` throws synchronously at module load if its
// native binary can't load on the host (e.g. a prebuilt binary that requires
// a newer CPU microarchitecture than the VPS actually has) — and because
// NestJS eagerly loads every module at boot, that single throw used to crash
// the entire API process before it could serve any request at all, not just
// image ones. Loading it lazily on first real use turns that into an
// ordinary, catchable rejection scoped to the Image Autopilot feature alone
// — the rest of the store (auth, cart, checkout, everything) keeps running,
// the same graceful-degradation principle already applied to Meilisearch.
let cached: typeof SharpType | null | undefined;

export function loadSharp(): typeof SharpType {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('sharp');
    } catch {
      cached = null;
    }
  }
  if (!cached) {
    throw new Error('پردازش تصویر در دسترس نیست (ماژول sharp روی این سرور بارگذاری نشد).');
  }
  return cached;
}
