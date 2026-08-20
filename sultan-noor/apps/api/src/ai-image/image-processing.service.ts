import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

export const AI_DRAFT_IMAGE_DIR = process.env.AI_DRAFT_IMAGE_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'ai-drafts');
export const AI_DRAFT_IMAGE_URL_PREFIX = '/api/draft-images';

const MAIN_MAX_DIMENSION = 1600;
const THUMBNAIL_SIZE = 400;
const JPEG_QUALITY = 82;
const WEBP_QUALITY = 80;
const AVIF_QUALITY = 60;

export interface ProcessedImageSet {
  // Absolute, servable URLs (baseUrl + AI_DRAFT_IMAGE_URL_PREFIX + filename).
  url: string; // JPEG main rendition — the universally-compatible fallback
  webpUrl: string;
  avifUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  fileSizeBytes: number;
}

@Injectable()
export class ImageProcessingService {
  // Writes the untouched source bytes to a separate "originals" subfolder —
  // never overwritten or re-derived from, kept purely for provenance/audit.
  storeOriginal(buffer: Buffer, extension: string): string {
    const dir = path.join(AI_DRAFT_IMAGE_DIR, 'originals');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${randomUUID()}${extension}`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    return filename;
  }

  // Produces every rendition the approval UI and, eventually, the published
  // product need: a resized (never upscaled, never cropped) JPEG main image
  // for universal compatibility, WebP and AVIF siblings, and a center-cropped
  // square thumbnail. The source buffer itself is never mutated.
  async processForCatalog(buffer: Buffer, baseUrl: string): Promise<ProcessedImageSet> {
    const dir = path.join(AI_DRAFT_IMAGE_DIR, 'processed');
    fs.mkdirSync(dir, { recursive: true });
    const id = randomUUID();

    const oriented = sharp(buffer, { limitInputPixels: 40_000_000 }).rotate();
    const resized = oriented.clone().resize({
      width: MAIN_MAX_DIMENSION,
      height: MAIN_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });

    const [jpeg, webp, avif, thumbnail] = await Promise.all([
      resized.clone().jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer({ resolveWithObject: true }),
      resized.clone().webp({ quality: WEBP_QUALITY }).toBuffer(),
      resized.clone().avif({ quality: AVIF_QUALITY }).toBuffer(),
      oriented
        .clone()
        .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: 'cover' })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer(),
    ]);

    const jpegName = `${id}.jpg`;
    const webpName = `${id}.webp`;
    const avifName = `${id}.avif`;
    const thumbName = `${id}-thumb.webp`;

    fs.writeFileSync(path.join(dir, jpegName), jpeg.data);
    fs.writeFileSync(path.join(dir, webpName), webp);
    fs.writeFileSync(path.join(dir, avifName), avif);
    fs.writeFileSync(path.join(dir, thumbName), thumbnail);

    return {
      url: `${baseUrl}${AI_DRAFT_IMAGE_URL_PREFIX}/processed/${jpegName}`,
      webpUrl: `${baseUrl}${AI_DRAFT_IMAGE_URL_PREFIX}/processed/${webpName}`,
      avifUrl: `${baseUrl}${AI_DRAFT_IMAGE_URL_PREFIX}/processed/${avifName}`,
      thumbnailUrl: `${baseUrl}${AI_DRAFT_IMAGE_URL_PREFIX}/processed/${thumbName}`,
      width: jpeg.info.width,
      height: jpeg.info.height,
      fileSizeBytes: jpeg.info.size,
    };
  }
}
