import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogService } from '../audit/audit-log.service';
import { ImageProcessingService } from './image-processing.service';
import { resolveImageSearchProvider, ImageSearchCandidate } from './providers/image-search.provider';
import { resolveBackgroundRemovalProvider } from './providers/background-removal.provider';
import { resolveImageGenerationProvider, buildSafeProductVisualPrompt } from './providers/image-generation.provider';
import { fetchImageSafely } from './util/safe-image-fetch';
import { validateImageBuffer, isDuplicateHash, scoreTextRelevance } from './util/image-validation';

const MAX_CANDIDATES_CONSIDERED = 8;
const MAX_IMAGES_PER_DRAFT = 4;
const MIN_RELEVANCE_SCORE = 0.15;
const IMAGE_ROLES = ['main', 'secondary', 'detail', 'lifestyle'] as const;

// Rough, static, currency-fluctuation-naive per-operation cost estimates in
// Toman, used only to give AiUsageLog/the monthly budget check a number to
// work with. Not accounting-grade — an honest approximation, not a real
// vendor invoice figure, and documented as such wherever it's surfaced.
const APPROXIMATE_COST_TOMAN: Record<string, number> = {
  'image-search': 300,
  'background-removal': 1500,
  'image-generation': 4000,
};

@Injectable()
export class AiImageAutopilotService {
  private readonly logger = new Logger(AiImageAutopilotService.name);

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private auditLog: AuditLogService,
    private imageProcessing: ImageProcessingService,
  ) {}

  // Best-effort, never-throwing entry point called from AiProductService.prepare().
  // Whatever happens inside, the text draft it was given always survives —
  // this only ever adds images to it or leaves a clear note that it couldn't.
  async runForDraft(draftId: string, baseUrl: string): Promise<void> {
    try {
      await this.run(draftId, baseUrl);
    } catch (err) {
      this.logger.error(`Image autopilot failed for draft ${draftId}`, err as Error);
      await this.markNote(draftId, 'تصویر خودکار آماده نشد؛ لطفاً تصویر را به‌صورت دستی آپلود کنید.');
      await this.auditLog.record({
        action: 'ai_image.autopilot_failed',
        entityType: 'ProductAiDraft',
        entityId: draftId,
        after: { reason: (err as Error).message },
      });
    }
  }

  private async run(draftId: string, baseUrl: string): Promise<void> {
    const draft = await this.prisma.productAiDraft.findUnique({ where: { id: draftId } });
    if (!draft) return;

    const [searchProvider, bgProvider, genProvider] = await Promise.all([
      resolveImageSearchProvider(this.settings),
      resolveBackgroundRemovalProvider(this.settings),
      resolveImageGenerationProvider(this.settings),
    ]);

    const existingHashes = (
      await this.prisma.productAiDraftImage.findMany({ where: { draftId }, select: { contentHash: true } })
    ).map((i) => i.contentHash);

    const accepted: { candidate: ImageSearchCandidate; buffer: Buffer; hash: string; score: number }[] = [];

    if (await searchProvider.isConfigured()) {
      if (await this.checkBudget('image-search')) {
        const candidates = await searchProvider.search(
          { productName: draft.name, brandName: draft.brandName ?? undefined, modelNumber: draft.modelNumber ?? undefined },
          MAX_CANDIDATES_CONSIDERED,
        );
        await this.recordUsage('image-search', draftId, candidates.length > 0);
        await this.auditLog.record({
          action: 'ai_image.search',
          entityType: 'ProductAiDraft',
          entityId: draftId,
          after: { provider: searchProvider.name, candidateCount: candidates.length },
        });

        for (const candidate of candidates) {
          if (accepted.length >= MAX_IMAGES_PER_DRAFT) break;
          const outcome = await this.evaluateCandidate(candidate, draft.name, draft.brandName, existingHashes, accepted);
          if (outcome.accepted) {
            accepted.push(outcome.accepted);
          } else {
            await this.auditLog.record({
              action: 'ai_image.candidate_rejected',
              entityType: 'ProductAiDraft',
              entityId: draftId,
              after: { sourceUrl: candidate.sourceUrl, reason: outcome.reason },
            });
          }
        }
      } else {
        await this.auditLog.record({
          action: 'ai_image.search_skipped',
          entityType: 'ProductAiDraft',
          entityId: draftId,
          after: { reason: 'بودجه ماهانه تصویر به پایان رسیده است' },
        });
      }
    }

    let persistedAny = false;
    for (let i = 0; i < accepted.length; i++) {
      const { candidate, buffer, hash, score } = accepted[i];
      const isMainSlot = i === 0;

      let workingBuffer = buffer;
      const imageType: 'REAL_SOURCE' | 'PROCESSED_REAL' = 'PROCESSED_REAL';

      if (isMainSlot && (await bgProvider.isConfigured()) && (await this.checkBudget('background-removal'))) {
        try {
          workingBuffer = await bgProvider.removeBackground(buffer);
          await this.recordUsage('background-removal', draftId, true);
          await this.auditLog.record({
            action: 'ai_image.background_removed',
            entityType: 'ProductAiDraft',
            entityId: draftId,
            after: { provider: bgProvider.name },
          });
        } catch (err) {
          // Keep the original processed image — background removal is a
          // nice-to-have, never a reason to drop an otherwise-good candidate.
          await this.recordUsage('background-removal', draftId, false);
          this.logger.warn(`Background removal failed for draft ${draftId}: ${(err as Error).message}`);
        }
      }

      const processed = await this.imageProcessing.processForCatalog(workingBuffer, baseUrl);
      await this.prisma.productAiDraftImage.create({
        data: {
          draftId,
          imageType,
          isMain: isMainSlot,
          role: IMAGE_ROLES[i],
          url: processed.url,
          webpUrl: processed.webpUrl,
          avifUrl: processed.avifUrl,
          thumbnailUrl: processed.thumbnailUrl,
          sourceUrl: candidate.sourceUrl,
          sourceProvider: candidate.sourceProvider,
          attribution: candidate.attribution,
          isOfficialSource: candidate.isOfficialSource,
          width: processed.width,
          height: processed.height,
          fileSizeBytes: processed.fileSizeBytes,
          format: 'jpeg',
          contentHash: hash,
          relevanceScore: score,
        },
      });
      persistedAny = true;
    }

    if (!persistedAny) {
      await this.tryGenerateFallback(draft, baseUrl, genProvider);
    }

    const finalCount = await this.prisma.productAiDraftImage.count({ where: { draftId } });
    if (finalCount === 0) {
      await this.markNote(draftId, 'تصویر خودکار آماده نشد؛ لطفاً تصویر را به‌صورت دستی آپلود کنید.');
      await this.auditLog.record({ action: 'ai_image.none_available', entityType: 'ProductAiDraft', entityId: draftId });
    }
  }

  private async evaluateCandidate(
    candidate: ImageSearchCandidate,
    productName: string,
    brandName: string | null,
    existingHashes: (string | null)[],
    alreadyAccepted: { hash: string }[],
  ): Promise<{ accepted?: { candidate: ImageSearchCandidate; buffer: Buffer; hash: string; score: number }; reason?: string }> {
    const score = scoreTextRelevance(candidate.title ?? candidate.attribution ?? '', productName, brandName);
    if (score < MIN_RELEVANCE_SCORE) return { reason: 'ارتباط تصویر با محصول ضعیف تشخیص داده شد' };

    let fetched;
    try {
      fetched = await fetchImageSafely(candidate.imageUrl);
    } catch (err) {
      return { reason: `دریافت تصویر ناموفق بود: ${(err as Error).message}` };
    }

    const validation = await validateImageBuffer(fetched.buffer);
    if (!validation.ok || !validation.contentHash) return { reason: validation.reason };

    if (isDuplicateHash(validation.contentHash, existingHashes) || alreadyAccepted.some((a) => a.hash === validation.contentHash)) {
      return { reason: 'تصویر تکراری است' };
    }

    return { accepted: { candidate, buffer: fetched.buffer, hash: validation.contentHash, score } };
  }

  private async tryGenerateFallback(
    draft: { id: string; name: string; categoryName: string | null },
    baseUrl: string,
    genProvider: Awaited<ReturnType<typeof resolveImageGenerationProvider>>,
  ): Promise<void> {
    if (!(await genProvider.isConfigured())) return;
    if (!(await this.checkBudget('image-generation'))) {
      await this.auditLog.record({
        action: 'ai_image.generation_skipped',
        entityType: 'ProductAiDraft',
        entityId: draft.id,
        after: { reason: 'بودجه ماهانه تصویر به پایان رسیده است' },
      });
      return;
    }

    const prompt = buildSafeProductVisualPrompt({ productName: draft.name, categoryName: draft.categoryName });
    try {
      const generated = await genProvider.generate(prompt);
      await this.recordUsage('image-generation', draft.id, true);

      const validation = await validateImageBuffer(generated.buffer);
      if (!validation.ok) {
        await this.auditLog.record({
          action: 'ai_image.generation_rejected',
          entityType: 'ProductAiDraft',
          entityId: draft.id,
          after: { reason: validation.reason },
        });
        return;
      }

      const processed = await this.imageProcessing.processForCatalog(generated.buffer, baseUrl);
      await this.prisma.productAiDraftImage.create({
        data: {
          draftId: draft.id,
          imageType: 'AI_GENERATED',
          isMain: true,
          role: 'main',
          url: processed.url,
          webpUrl: processed.webpUrl,
          avifUrl: processed.avifUrl,
          thumbnailUrl: processed.thumbnailUrl,
          isOfficialSource: false,
          width: processed.width,
          height: processed.height,
          fileSizeBytes: processed.fileSizeBytes,
          format: 'jpeg',
          contentHash: validation.contentHash,
          aiProvider: generated.provider,
          aiPromptVersion: generated.promptVersion,
          aiPrompt: generated.prompt,
          generatedAt: new Date(),
        },
      });

      await this.auditLog.record({
        action: 'ai_image.ai_generated',
        entityType: 'ProductAiDraft',
        entityId: draft.id,
        after: { provider: generated.provider, promptVersion: generated.promptVersion },
      });
    } catch (err) {
      await this.recordUsage('image-generation', draft.id, false);
      this.logger.warn(`AI image generation failed for draft ${draft.id}: ${(err as Error).message}`);
      await this.auditLog.record({
        action: 'ai_image.generation_failed',
        entityType: 'ProductAiDraft',
        entityId: draft.id,
        after: { reason: (err as Error).message },
      });
    }
  }

  async listImages(draftId: string) {
    return this.prisma.productAiDraftImage.findMany({ where: { draftId }, orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }] });
  }

  private async getOwnedImage(draftId: string, imageId: string) {
    const image = await this.prisma.productAiDraftImage.findUnique({ where: { id: imageId } });
    if (!image || image.draftId !== draftId) throw new NotFoundException('تصویر یافت نشد');
    return image;
  }

  async approveImage(draftId: string, imageId: string, userId?: string) {
    const before = await this.getOwnedImage(draftId, imageId);
    const updated = await this.prisma.productAiDraftImage.update({ where: { id: imageId }, data: { status: 'APPROVED', rejectionReason: null } });
    await this.auditLog.record({ userId, action: 'ai_image.approved', entityType: 'ProductAiDraftImage', entityId: imageId, before, after: updated });
    return updated;
  }

  async rejectImage(draftId: string, imageId: string, reason: string | undefined, userId?: string) {
    const before = await this.getOwnedImage(draftId, imageId);
    const updated = await this.prisma.productAiDraftImage.update({
      where: { id: imageId },
      data: { status: 'REJECTED', rejectionReason: reason, isMain: false },
    });
    await this.auditLog.record({ userId, action: 'ai_image.rejected', entityType: 'ProductAiDraftImage', entityId: imageId, before, after: updated });
    return updated;
  }

  async setMainImage(draftId: string, imageId: string, userId?: string) {
    await this.getOwnedImage(draftId, imageId);
    await this.prisma.$transaction([
      this.prisma.productAiDraftImage.updateMany({ where: { draftId }, data: { isMain: false } }),
      this.prisma.productAiDraftImage.update({ where: { id: imageId }, data: { isMain: true, status: 'APPROVED' } }),
    ]);
    await this.auditLog.record({ userId, action: 'ai_image.set_main', entityType: 'ProductAiDraftImage', entityId: imageId });
    return this.prisma.productAiDraftImage.findUnique({ where: { id: imageId } });
  }

  // Rejects the current image in that slot and generates a fresh AI visual
  // to take its place — the new image is a CANDIDATE like any other AI
  // output, requiring the admin's own approval before it counts toward
  // publish. Never falls back to a real-source search (that's what "search"
  // is for) — this action is specifically the AI-generation path.
  async regenerateImage(draftId: string, imageId: string, baseUrl: string, userId?: string) {
    const draft = await this.prisma.productAiDraft.findUnique({ where: { id: draftId } });
    if (!draft) throw new NotFoundException('پیش‌نویس یافت نشد');
    const old = await this.getOwnedImage(draftId, imageId);

    const genProvider = await resolveImageGenerationProvider(this.settings);
    if (!(await genProvider.isConfigured())) {
      throw new BadRequestException('برای این قابلیت باید کلید API سرویس تولید تصویر در بخش تنظیمات وارد شود.');
    }
    if (!(await this.checkBudget('image-generation'))) {
      throw new BadRequestException('بودجه ماهانه تصویر هوش مصنوعی برای این ماه به پایان رسیده است.');
    }

    await this.prisma.productAiDraftImage.update({
      where: { id: imageId },
      data: { status: 'REJECTED', rejectionReason: 'با یک تصویر جدید جایگزین شد', isMain: false },
    });

    const prompt = buildSafeProductVisualPrompt({ productName: draft.name, categoryName: draft.categoryName });
    const generated = await genProvider.generate(prompt);
    await this.recordUsage('image-generation', draftId, true);

    const validation = await validateImageBuffer(generated.buffer);
    if (!validation.ok) throw new BadRequestException(validation.reason ?? 'تصویر تولیدشده معتبر نیست');

    const processed = await this.imageProcessing.processForCatalog(generated.buffer, baseUrl);
    const created = await this.prisma.productAiDraftImage.create({
      data: {
        draftId,
        imageType: 'AI_GENERATED',
        isMain: old.isMain,
        role: old.role,
        url: processed.url,
        webpUrl: processed.webpUrl,
        avifUrl: processed.avifUrl,
        thumbnailUrl: processed.thumbnailUrl,
        isOfficialSource: false,
        width: processed.width,
        height: processed.height,
        fileSizeBytes: processed.fileSizeBytes,
        format: 'jpeg',
        contentHash: validation.contentHash,
        aiProvider: generated.provider,
        aiPromptVersion: generated.promptVersion,
        aiPrompt: generated.prompt,
        generatedAt: new Date(),
      },
    });

    await this.auditLog.record({
      userId,
      action: 'ai_image.regenerated',
      entityType: 'ProductAiDraftImage',
      entityId: created.id,
      before: old,
      after: { provider: generated.provider },
    });
    return created;
  }

  // Manual fallback upload — used either when autopilot found nothing
  // (imageAutopilotNote is set) or when staff simply prefers to supply their
  // own photo. Explicit human action, so it's accepted as APPROVED
  // immediately rather than starting as an unreviewed CANDIDATE.
  async uploadManualImage(draftId: string, buffer: Buffer, baseUrl: string, userId?: string) {
    const draft = await this.prisma.productAiDraft.findUnique({ where: { id: draftId } });
    if (!draft) throw new NotFoundException('پیش‌نویس یافت نشد');

    const validation = await validateImageBuffer(buffer);
    if (!validation.ok) throw new BadRequestException(validation.reason ?? 'تصویر معتبر نیست');

    const existingCount = await this.prisma.productAiDraftImage.count({ where: { draftId, status: { not: 'REJECTED' } } });
    const processed = await this.imageProcessing.processForCatalog(buffer, baseUrl);
    const created = await this.prisma.productAiDraftImage.create({
      data: {
        draftId,
        imageType: 'ADMIN_UPLOADED',
        status: 'APPROVED',
        isMain: existingCount === 0,
        role: existingCount === 0 ? 'main' : undefined,
        url: processed.url,
        webpUrl: processed.webpUrl,
        avifUrl: processed.avifUrl,
        thumbnailUrl: processed.thumbnailUrl,
        isOfficialSource: false,
        width: processed.width,
        height: processed.height,
        fileSizeBytes: processed.fileSizeBytes,
        format: 'jpeg',
        contentHash: validation.contentHash,
      },
    });

    await this.auditLog.record({ userId, action: 'ai_image.manual_upload', entityType: 'ProductAiDraftImage', entityId: created.id });
    return created;
  }

  private async markNote(draftId: string, note: string): Promise<void> {
    await this.prisma.productAiDraft.update({ where: { id: draftId }, data: { imageAutopilotNote: note } }).catch(() => undefined);
  }

  // The budget is a single combined monthly pool across every image
  // operation (search + background removal + generation) — the operation
  // name is accepted only so call sites stay self-documenting. Scoped to
  // just the image-* providers so it stays independent of the separate
  // SEO/Content Autopilot budget pool that shares this same AiUsageLog table.
  private async checkBudget(_operation: keyof typeof APPROXIMATE_COST_TOMAN): Promise<boolean> {
    const budgetRaw = await this.settings.resolve('imageAutopilotMonthlyBudgetToman');
    if (!budgetRaw) return true; // no budget configured yet = not opted into cost control
    const budget = Number(budgetRaw);
    if (!Number.isFinite(budget) || budget <= 0) return true;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const usage = await this.prisma.aiUsageLog.aggregate({
      where: { createdAt: { gte: startOfMonth }, provider: { in: Object.keys(APPROXIMATE_COST_TOMAN) } },
      _sum: { costToman: true },
    });
    const spent = Number(usage._sum.costToman ?? 0);
    return spent < budget;
  }

  private async recordUsage(operation: keyof typeof APPROXIMATE_COST_TOMAN, draftId: string, success: boolean): Promise<void> {
    await this.prisma.aiUsageLog.create({
      data: {
        provider: operation,
        operation,
        draftId,
        costToman: success ? APPROXIMATE_COST_TOMAN[operation] : 0,
        success,
        note: 'برآورد تقریبی هزینه — نه رقم دقیق صورتحساب',
      },
    });
  }
}
