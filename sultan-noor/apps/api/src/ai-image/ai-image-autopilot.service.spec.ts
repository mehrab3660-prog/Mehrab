import { BadRequestException, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { AiImageAutopilotService } from './ai-image-autopilot.service';
import { resolveImageSearchProvider } from './providers/image-search.provider';
import { resolveBackgroundRemovalProvider } from './providers/background-removal.provider';
import { resolveImageGenerationProvider } from './providers/image-generation.provider';
import { fetchImageSafely } from './util/safe-image-fetch';

jest.mock('./providers/image-search.provider');
jest.mock('./providers/background-removal.provider');
jest.mock('./providers/image-generation.provider', () => ({
  ...jest.requireActual('./providers/image-generation.provider'),
  resolveImageGenerationProvider: jest.fn(),
}));
jest.mock('./util/safe-image-fetch', () => ({
  ...jest.requireActual('./util/safe-image-fetch'),
  fetchImageSafely: jest.fn(),
}));

const mockResolveSearch = resolveImageSearchProvider as jest.Mock;
const mockResolveBg = resolveBackgroundRemovalProvider as jest.Mock;
const mockResolveGen = resolveImageGenerationProvider as jest.Mock;
const mockFetchSafely = fetchImageSafely as jest.Mock;

async function realJpeg(width = 900, height = 700): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 60, b: 120 } } }).jpeg().toBuffer();
}

function unconfiguredSearchProvider() {
  return { name: 'none', isConfigured: jest.fn().mockResolvedValue(false), search: jest.fn() };
}
function unconfiguredBgProvider() {
  return { name: 'none', isConfigured: jest.fn().mockResolvedValue(false), removeBackground: jest.fn() };
}
function unconfiguredGenProvider() {
  return { name: 'none', isConfigured: jest.fn().mockResolvedValue(false), generate: jest.fn() };
}

describe('AiImageAutopilotService', () => {
  let prisma: any;
  let settings: any;
  let auditLog: any;
  let imageProcessing: any;
  let service: AiImageAutopilotService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      productAiDraft: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      productAiDraftImage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'created-img' }),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
      aiUsageLog: { create: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: { costToman: 0 } }) },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    settings = { resolve: jest.fn().mockResolvedValue(undefined) };
    auditLog = { record: jest.fn() };
    imageProcessing = {
      processForCatalog: jest.fn().mockResolvedValue({
        url: 'http://x/processed/a.jpg',
        webpUrl: 'http://x/processed/a.webp',
        avifUrl: 'http://x/processed/a.avif',
        thumbnailUrl: 'http://x/processed/a-thumb.webp',
        width: 900,
        height: 700,
        fileSizeBytes: 12345,
      }),
    };
    service = new AiImageAutopilotService(prisma, settings, auditLog, imageProcessing);

    mockResolveSearch.mockResolvedValue(unconfiguredSearchProvider());
    mockResolveBg.mockResolvedValue(unconfiguredBgProvider());
    mockResolveGen.mockResolvedValue(unconfiguredGenProvider());
  });

  describe('runForDraft', () => {
    it('does nothing (never throws) when the draft no longer exists', async () => {
      prisma.productAiDraft.findUnique.mockResolvedValue(null);
      await expect(service.runForDraft('missing', 'http://x')).resolves.toBeUndefined();
      expect(prisma.productAiDraftImage.create).not.toHaveBeenCalled();
    });

    it('sets a clear note and logs when no provider is configured at all', async () => {
      prisma.productAiDraft.findUnique.mockResolvedValue({ id: 'd1', name: 'محصول', brandName: null, modelNumber: null, categoryName: null });
      prisma.productAiDraftImage.count.mockResolvedValue(0);

      await service.runForDraft('d1', 'http://x');

      expect(prisma.productAiDraft.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { imageAutopilotNote: expect.stringContaining('تصویر خودکار آماده نشد') },
      });
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_image.none_available' }));
    });

    it('accepts a relevant candidate, rejects an irrelevant one, and persists the accepted image as main/PROCESSED_REAL', async () => {
      const draft = { id: 'd1', name: 'کلید مینیاتوری اشنایدر', brandName: 'اشنایدر', modelNumber: 'C16', categoryName: 'کلید و پریز' };
      prisma.productAiDraft.findUnique.mockResolvedValue(draft);
      prisma.productAiDraftImage.count.mockResolvedValue(1);

      const goodCandidate = { imageUrl: 'https://supplier.example/good.jpg', sourceUrl: 'https://supplier.example/p', sourceProvider: 'bing', title: 'اشنایدر کلید مینیاتوری C16', isOfficialSource: false };
      const badCandidate = { imageUrl: 'https://random.example/unrelated.jpg', sourceUrl: 'https://random.example', sourceProvider: 'bing', title: 'a photo of a cat', isOfficialSource: false };

      mockResolveSearch.mockResolvedValue({
        name: 'bing',
        isConfigured: jest.fn().mockResolvedValue(true),
        search: jest.fn().mockResolvedValue([goodCandidate, badCandidate]),
      });
      mockFetchSafely.mockResolvedValue({ buffer: await realJpeg(), contentType: 'image/jpeg', finalUrl: 'x' });

      await service.runForDraft('d1', 'http://x');

      expect(prisma.productAiDraftImage.create).toHaveBeenCalledTimes(1);
      const created = prisma.productAiDraftImage.create.mock.calls[0][0].data;
      expect(created.imageType).toBe('PROCESSED_REAL');
      expect(created.isMain).toBe(true);
      expect(created.role).toBe('main');
      expect(created.sourceUrl).toBe(goodCandidate.sourceUrl);

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ai_image.candidate_rejected', after: expect.objectContaining({ reason: expect.stringContaining('ارتباط') }) }),
      );
    });

    it('rejects a duplicate candidate whose bytes already exist for this draft', async () => {
      const draft = { id: 'd1', name: 'کلید مینیاتوری اشنایدر', brandName: 'اشنایدر', modelNumber: null, categoryName: null };
      prisma.productAiDraft.findUnique.mockResolvedValue(draft);
      const sameBuffer = await realJpeg();
      prisma.productAiDraftImage.findMany.mockResolvedValue([]); // existing hashes query — none yet in DB
      prisma.productAiDraftImage.count.mockResolvedValue(0);

      const candidateA = { imageUrl: 'https://s.example/a.jpg', sourceUrl: 'https://s.example', sourceProvider: 'bing', title: 'اشنایدر کلید مینیاتوری', isOfficialSource: false };
      const candidateB = { imageUrl: 'https://s.example/b.jpg', sourceUrl: 'https://s.example', sourceProvider: 'bing', title: 'اشنایدر کلید مینیاتوری', isOfficialSource: false };

      mockResolveSearch.mockResolvedValue({
        name: 'bing',
        isConfigured: jest.fn().mockResolvedValue(true),
        search: jest.fn().mockResolvedValue([candidateA, candidateB]),
      });
      mockFetchSafely.mockResolvedValue({ buffer: sameBuffer, contentType: 'image/jpeg', finalUrl: 'x' });

      await service.runForDraft('d1', 'http://x');

      expect(prisma.productAiDraftImage.create).toHaveBeenCalledTimes(1); // only the first of the two identical images
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ai_image.candidate_rejected', after: expect.objectContaining({ reason: 'تصویر تکراری است' }) }),
      );
    });

    it('skips search entirely once the monthly budget is exhausted', async () => {
      const draft = { id: 'd1', name: 'محصول', brandName: null, modelNumber: null, categoryName: null };
      prisma.productAiDraft.findUnique.mockResolvedValue(draft);
      prisma.productAiDraftImage.count.mockResolvedValue(0);
      settings.resolve.mockImplementation((key: string) => Promise.resolve(key === 'imageAutopilotMonthlyBudgetToman' ? '1000' : undefined));
      prisma.aiUsageLog.aggregate.mockResolvedValue({ _sum: { costToman: 5000 } }); // already over budget

      const search = jest.fn();
      mockResolveSearch.mockResolvedValue({ name: 'bing', isConfigured: jest.fn().mockResolvedValue(true), search });

      await service.runForDraft('d1', 'http://x');

      expect(search).not.toHaveBeenCalled();
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_image.search_skipped' }));
    });

    it('falls back to AI generation when no real image was accepted, and labels it AI_GENERATED', async () => {
      const draft = { id: 'd1', name: 'محصول ناشناخته', brandName: null, modelNumber: null, categoryName: 'روشنایی' };
      prisma.productAiDraft.findUnique.mockResolvedValue(draft);
      prisma.productAiDraftImage.count.mockResolvedValue(0);

      const genBuffer = await realJpeg();
      mockResolveGen.mockResolvedValue({
        name: 'openai',
        isConfigured: jest.fn().mockResolvedValue(true),
        generate: jest.fn().mockResolvedValue({ buffer: genBuffer, provider: 'openai', promptVersion: 'product-visual-v1', prompt: 'a generic unbranded product' }),
      });

      await service.runForDraft('d1', 'http://x');

      expect(prisma.productAiDraftImage.create).toHaveBeenCalledTimes(1);
      const created = prisma.productAiDraftImage.create.mock.calls[0][0].data;
      expect(created.imageType).toBe('AI_GENERATED');
      expect(created.isMain).toBe(true);
      expect(created.aiProvider).toBe('openai');
      expect(created.aiPromptVersion).toBe('product-visual-v1');
      expect(created.generatedAt).toBeInstanceOf(Date);
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_image.ai_generated' }));
    });

    it('logs a failed-generation attempt and still leaves a clear note instead of throwing', async () => {
      const draft = { id: 'd1', name: 'محصول', brandName: null, modelNumber: null, categoryName: null };
      prisma.productAiDraft.findUnique.mockResolvedValue(draft);
      prisma.productAiDraftImage.count.mockResolvedValue(0);

      mockResolveGen.mockResolvedValue({
        name: 'openai',
        isConfigured: jest.fn().mockResolvedValue(true),
        generate: jest.fn().mockRejectedValue(new Error('rate limited')),
      });

      await service.runForDraft('d1', 'http://x');

      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_image.generation_failed' }));
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_image.none_available' }));
      expect(prisma.aiUsageLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operation: 'image-generation', success: false }) }));
    });

    it('never throws even when something inside fails unexpectedly (failure boundary)', async () => {
      prisma.productAiDraft.findUnique.mockRejectedValue(new Error('db exploded'));
      await expect(service.runForDraft('d1', 'http://x')).resolves.toBeUndefined();
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_image.autopilot_failed' }));
    });
  });

  describe('per-image approve/reject/set-main', () => {
    it('throws NotFoundException when the image does not belong to the given draft', async () => {
      prisma.productAiDraftImage.findUnique.mockResolvedValue({ id: 'img1', draftId: 'other-draft' });
      await expect(service.approveImage('d1', 'img1')).rejects.toThrow(NotFoundException);
    });

    it('approves an image and logs the audit entry', async () => {
      const image = { id: 'img1', draftId: 'd1', status: 'CANDIDATE' };
      prisma.productAiDraftImage.findUnique.mockResolvedValue(image);
      prisma.productAiDraftImage.update.mockResolvedValue({ ...image, status: 'APPROVED' });

      const result = await service.approveImage('d1', 'img1', 'user1');
      expect(result.status).toBe('APPROVED');
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_image.approved', userId: 'user1' }));
    });

    it('rejects an image and unsets isMain', async () => {
      const image = { id: 'img1', draftId: 'd1', status: 'CANDIDATE', isMain: true };
      prisma.productAiDraftImage.findUnique.mockResolvedValue(image);
      prisma.productAiDraftImage.update.mockResolvedValue({ ...image, status: 'REJECTED', isMain: false });

      const result = await service.rejectImage('d1', 'img1', 'کیفیت پایین', 'user1');
      expect(result.status).toBe('REJECTED');
      expect(prisma.productAiDraftImage.update).toHaveBeenCalledWith({
        where: { id: 'img1' },
        data: { status: 'REJECTED', rejectionReason: 'کیفیت پایین', isMain: false },
      });
    });

    it('setMainImage clears every other image before setting the new main one', async () => {
      prisma.productAiDraftImage.findUnique
        .mockResolvedValueOnce({ id: 'img2', draftId: 'd1' }) // getOwnedImage lookup
        .mockResolvedValueOnce({ id: 'img2', draftId: 'd1', isMain: true }); // final re-fetch

      await service.setMainImage('d1', 'img2', 'user1');

      expect(prisma.productAiDraftImage.updateMany).toHaveBeenCalledWith({ where: { draftId: 'd1' }, data: { isMain: false } });
      expect(prisma.productAiDraftImage.update).toHaveBeenCalledWith({ where: { id: 'img2' }, data: { isMain: true, status: 'APPROVED' } });
    });
  });

  describe('regenerateImage', () => {
    it('throws BadRequestException when no generation provider is configured', async () => {
      prisma.productAiDraft.findUnique.mockResolvedValue({ id: 'd1', name: 'x', categoryName: null });
      prisma.productAiDraftImage.findUnique.mockResolvedValue({ id: 'img1', draftId: 'd1' });
      await expect(service.regenerateImage('d1', 'img1', 'http://x')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the monthly budget is exhausted', async () => {
      prisma.productAiDraft.findUnique.mockResolvedValue({ id: 'd1', name: 'x', categoryName: null });
      prisma.productAiDraftImage.findUnique.mockResolvedValue({ id: 'img1', draftId: 'd1' });
      mockResolveGen.mockResolvedValue({ name: 'openai', isConfigured: jest.fn().mockResolvedValue(true), generate: jest.fn() });
      settings.resolve.mockImplementation((key: string) => Promise.resolve(key === 'imageAutopilotMonthlyBudgetToman' ? '100' : undefined));
      prisma.aiUsageLog.aggregate.mockResolvedValue({ _sum: { costToman: 999 } });

      await expect(service.regenerateImage('d1', 'img1', 'http://x')).rejects.toThrow(BadRequestException);
    });

    it('rejects the old image and creates a new AI_GENERATED candidate in the same slot', async () => {
      prisma.productAiDraft.findUnique.mockResolvedValue({ id: 'd1', name: 'محصول', categoryName: 'روشنایی' });
      prisma.productAiDraftImage.findUnique.mockResolvedValue({ id: 'img1', draftId: 'd1', isMain: true, role: 'main' });
      const genBuffer = await realJpeg();
      mockResolveGen.mockResolvedValue({
        name: 'openai',
        isConfigured: jest.fn().mockResolvedValue(true),
        generate: jest.fn().mockResolvedValue({ buffer: genBuffer, provider: 'openai', promptVersion: 'product-visual-v1', prompt: 'p' }),
      });
      prisma.productAiDraftImage.create.mockResolvedValue({ id: 'img2', imageType: 'AI_GENERATED' });

      const result = await service.regenerateImage('d1', 'img1', 'http://x', 'user1');

      expect(prisma.productAiDraftImage.update).toHaveBeenCalledWith({
        where: { id: 'img1' },
        data: { status: 'REJECTED', rejectionReason: 'با یک تصویر جدید جایگزین شد', isMain: false },
      });
      expect(result.id).toBe('img2');
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_image.regenerated' }));
    });
  });

  describe('uploadManualImage', () => {
    it('rejects an invalid image buffer instead of storing it', async () => {
      prisma.productAiDraft.findUnique.mockResolvedValue({ id: 'd1' });
      await expect(service.uploadManualImage('d1', Buffer.from('not an image'), 'http://x')).rejects.toThrow(BadRequestException);
      expect(prisma.productAiDraftImage.create).not.toHaveBeenCalled();
    });

    it('stores a valid manual upload as ADMIN_UPLOADED, APPROVED, and main when it is the first image', async () => {
      prisma.productAiDraft.findUnique.mockResolvedValue({ id: 'd1' });
      prisma.productAiDraftImage.count.mockResolvedValue(0);
      const buf = await realJpeg();

      await service.uploadManualImage('d1', buf, 'http://x', 'user1');

      const created = prisma.productAiDraftImage.create.mock.calls[0][0].data;
      expect(created.imageType).toBe('ADMIN_UPLOADED');
      expect(created.status).toBe('APPROVED');
      expect(created.isMain).toBe(true);
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_image.manual_upload' }));
    });
  });
});
