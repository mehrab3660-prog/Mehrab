import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Validates and writes an uploaded image to `dir`, returning the generated
// filename. Never trusts the client-supplied filename or extension — rules
// out path traversal and collisions by generating a fresh name.
export function saveUploadedImage(file: Express.Multer.File, dir: string): string {
  const extension = ALLOWED_IMAGE_TYPES[file.mimetype];
  if (!extension) throw new BadRequestException('فقط تصاویر JPG، PNG یا WebP پذیرفته می‌شود');
  if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException('حجم تصویر نباید بیشتر از ۵ مگابایت باشد');

  fs.mkdirSync(dir, { recursive: true });
  const filename = `${randomUUID()}${extension}`;
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return filename;
}

export function deleteUploadedImage(url: string, dir: string): void {
  const filename = path.basename(url);
  fs.rm(path.join(dir, filename), { force: true }, () => {
    // Best-effort — the DB row is the source of truth for what's shown; a
    // leftover orphaned file on disk isn't worth failing the request over.
  });
}
