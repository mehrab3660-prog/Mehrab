import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { SettingsService } from '../settings/settings.service';
import { ProductsService } from '../catalog/products/products.service';
import { CartService } from '../cart/cart.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { calculateShoppingListQuantities, ConsultantItemKey, ConsultantTier, RoomBreakdown } from './calculators/electrical-calculators';
import { buildPackageLine, CandidateProduct, ItemRequirement, PackageLine } from './calculators/package-builder';
import { ELECTRICAL_SAFETY_DISCLAIMER } from './calculators/electrical-safety';
import { parsePreferences } from './preference-parser';
import { AddConsultationToCartDto, SetConsultationPreferencesDto, UpdateConsultationInputDto } from './dto/consultant.dto';

const REQUIRED_FIELDS = ['areaSqm', 'bedrooms', 'livingRooms', 'kitchens', 'bathrooms'] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];

const FIELD_QUESTION: Record<RequiredField, string> = {
  areaSqm: 'متراژ تقریبی واحد (متر مربع) چقدر است؟',
  bedrooms: 'چند اتاق خواب دارد؟',
  livingRooms: 'چند فضای پذیرایی/نشیمن دارد؟',
  kitchens: 'چند آشپزخانه دارد؟',
  bathrooms: 'چند سرویس بهداشتی/حمام دارد؟',
};

const TIERS: ConsultantTier[] = ['ECONOMIC', 'STANDARD', 'PROFESSIONAL'];

type HydratedProduct = Awaited<ReturnType<ProductsService['getManyByIds']>>[number];

// Guided, structured need-analysis + real-catalog package generation
// (Sprint 7). Architecture mirrors the Store-only AI Product Seller
// (Sprint 6): calculators are pure/deterministic, package lines are always
// built from real, currently-hydrated Catalog data, and nothing is ever
// added to a real cart without an explicit customer confirmation step.
@Injectable()
export class ElectricalConsultantService {
  constructor(
    private prisma: PrismaService,
    private search: SearchService,
    private settings: SettingsService,
    private products: ProductsService,
    private cart: CartService,
    private activityLog: ActivityLogService,
  ) {}

  async isEnabled(): Promise<boolean> {
    const raw = await this.settings.resolve('electricalConsultantEnabled');
    return raw !== 'false';
  }

  async start(userId?: string) {
    const enabled = await this.isEnabled();
    if (!enabled) throw new BadRequestException('مشاور هوشمند برق در حال حاضر غیرفعال است.');

    const consultation = await this.prisma.electricalConsultation.create({ data: { userId } });
    await this.activityLog.record({ userId, event: 'consultant.consultation_started' });
    return this.toResponse(consultation);
  }

  async getById(id: string, requesterUserId?: string) {
    const consultation = await this.findOwned(id, requesterUserId);
    return this.toResponse(consultation);
  }

  // Logged-in users only — a consultation with no owner (a guest session)
  // never appears in anyone's history, and one user's real consultations
  // never appear in another user's list.
  async listMine(userId: string) {
    return this.prisma.electricalConsultation.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async updateInput(id: string, dto: UpdateConsultationInputDto, requesterUserId?: string) {
    await this.findOwned(id, requesterUserId);
    const consultation = await this.prisma.electricalConsultation.update({
      where: { id },
      data: {
        ...(dto.areaSqm !== undefined ? { areaSqm: dto.areaSqm } : {}),
        ...(dto.bedrooms !== undefined ? { bedrooms: dto.bedrooms } : {}),
        ...(dto.livingRooms !== undefined ? { livingRooms: dto.livingRooms } : {}),
        ...(dto.kitchens !== undefined ? { kitchens: dto.kitchens } : {}),
        ...(dto.bathrooms !== undefined ? { bathrooms: dto.bathrooms } : {}),
        ...(dto.otherRooms !== undefined ? { otherRooms: dto.otherRooms } : {}),
        ...(dto.hasStaircase !== undefined ? { hasStaircase: dto.hasStaircase } : {}),
        ...(dto.buildingType !== undefined ? { buildingType: dto.buildingType } : {}),
      },
    });
    return this.toResponse(consultation);
  }

  async setPreferences(id: string, dto: SetConsultationPreferencesDto, requesterUserId?: string) {
    await this.findOwned(id, requesterUserId);
    const parsed = parsePreferences(dto.text);

    let matchedBrand: { id: string; name: string } | null = null;
    if (parsed.preferredBrandName) {
      matchedBrand = await this.prisma.brand.findFirst({
        where: { name: { contains: parsed.preferredBrandName, mode: 'insensitive' }, isActive: true },
        select: { id: true, name: true },
      });
    }

    const consultation = await this.prisma.electricalConsultation.update({
      where: { id },
      data: {
        preferencesText: dto.text,
        cheapestOnly: parsed.cheapestOnly,
        higherQuality: parsed.higherQuality,
        preferredBrandId: matchedBrand?.id ?? null,
      },
    });

    return {
      ...this.toResponse(consultation),
      // Honest feedback (§9): if the customer named a brand we couldn't
      // match to a real, active Brand, say so rather than silently ignoring it.
      requestedBrandName: parsed.preferredBrandName,
      brandRecognized: !!matchedBrand,
    };
  }

  private missingFields(consultation: { areaSqm: number | null; bedrooms: number | null; livingRooms: number | null; kitchens: number | null; bathrooms: number | null }): RequiredField[] {
    return REQUIRED_FIELDS.filter((f) => consultation[f] === null || consultation[f] === undefined);
  }

  private toResponse(consultation: any) {
    const missing = this.missingFields(consultation);
    return {
      consultation,
      missingFields: missing,
      nextQuestion: missing.length > 0 ? FIELD_QUESTION[missing[0]] : null,
      readyToGenerate: missing.length === 0,
    };
  }

  private async findOwned(id: string, requesterUserId?: string) {
    const consultation = await this.prisma.electricalConsultation.findUnique({ where: { id } });
    if (!consultation) throw new NotFoundException('مشاوره یافت نشد');
    // A consultation created by a logged-in user is private to them — a
    // different logged-in user (or a guest) may never read or modify it.
    // A guest-created consultation (userId null) uses the same trust model
    // as the AI advisor's conversationId: an unguessable id is the access key.
    if (consultation.userId && consultation.userId !== requesterUserId) {
      throw new ForbiddenException('شما به این مشاوره دسترسی ندارید');
    }
    return consultation;
  }

  // The core Shopping Calculator (§2/§3): real, deterministic quantities
  // (electrical-calculators.ts) matched against real, currently-hydrated
  // Catalog candidates (package-builder.ts) for each of the three tiers.
  // A tier is only included in the result if it produced at least one real
  // line — an empty/fabricated tier is never shown (§3).
  async generatePackages(id: string, requesterUserId?: string) {
    const consultation = await this.findOwned(id, requesterUserId);
    const missing = this.missingFields(consultation);
    if (missing.length > 0) {
      throw new BadRequestException(`اطلاعات کافی برای محاسبه وجود ندارد؛ نیاز به: ${missing.map((f) => FIELD_QUESTION[f]).join('، ')}`);
    }

    const rooms: RoomBreakdown = {
      areaSqm: consultation.areaSqm!,
      bedrooms: consultation.bedrooms!,
      livingRooms: consultation.livingRooms!,
      kitchens: consultation.kitchens!,
      bathrooms: consultation.bathrooms!,
      otherRooms: consultation.otherRooms ?? 0,
      hasStaircase: consultation.hasStaircase ?? false,
    };

    const rules = await this.prisma.consultantItemRule.findMany({ where: { isActive: true } });
    const ruleByItemKey = new Map(rules.map((r) => [r.itemKey, r]));

    // A customer preference always overrides the nominal tier's own
    // candidate-selection strategy (§9), while the tier still keeps its own
    // real, calculated item quantities/coverage — "ارزان‌ترین" doesn't
    // collapse the three packages into one, it just prices every tier with
    // the cheapest real product for each item.
    const selectionOverride: ConsultantTier | null = consultation.cheapestOnly ? 'ECONOMIC' : consultation.higherQuality ? 'PROFESSIONAL' : null;

    const packages: Partial<Record<ConsultantTier, PackageLine[]>> = {};
    const noMatchItemKeys = new Set<string>();
    const candidateCache = new Map<string, CandidateProduct[]>();

    for (const tier of TIERS) {
      const quantities = calculateShoppingListQuantities(rooms, tier);
      const lines: PackageLine[] = [];

      for (const [itemKeyRaw, quantity] of Object.entries(quantities)) {
        const itemKey = itemKeyRaw as ConsultantItemKey;
        if (quantity <= 0) continue;

        const rule = ruleByItemKey.get(itemKey);
        if (!rule) {
          noMatchItemKeys.add(itemKey);
          continue;
        }

        let candidates = candidateCache.get(rule.id);
        if (!candidates) {
          candidates = await this.findCandidates(rule, consultation.preferredBrandId);
          candidateCache.set(rule.id, candidates);
        }

        const requirement: ItemRequirement = {
          itemKey,
          label: rule.label,
          quantity,
          minQuantity: rule.minQuantity,
          maxQuantity: rule.maxQuantity,
          priorityBrandIds: (rule.priorityBrandIds ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        };

        const line = buildPackageLine(requirement, candidates, selectionOverride ?? tier);
        if (line) lines.push(line);
        else noMatchItemKeys.add(itemKey);
      }

      if (lines.length > 0) packages[tier] = lines;
    }

    const packagesWithTotals = Object.fromEntries(
      Object.entries(packages).map(([tier, lines]) => [tier, { lines, total: lines!.reduce((sum, l) => sum + l.lineTotal, 0) }]),
    );

    const consultationAfter = await this.prisma.electricalConsultation.update({
      where: { id },
      data: {
        status: 'READY',
        packagesJson: packagesWithTotals as unknown as Prisma.InputJsonValue,
        noMatchItemKeysJson: Array.from(noMatchItemKeys),
      },
    });

    await this.activityLog.record({
      userId: requesterUserId,
      event: 'consultant.package_generated',
      metadata: { tiers: Object.keys(packagesWithTotals), noMatchCount: noMatchItemKeys.size },
    });
    if (noMatchItemKeys.size > 0) {
      await this.activityLog.record({ userId: requesterUserId, event: 'consultant.no_match', metadata: { itemKeys: Array.from(noMatchItemKeys) } });
    }

    return {
      consultation: consultationAfter,
      packages: packagesWithTotals,
      noMatchItemKeys: Array.from(noMatchItemKeys),
      safetyDisclaimer: ELECTRICAL_SAFETY_DISCLAIMER,
    };
  }

  private async findCandidates(
    rule: { categoryId: string | null; keywords: string | null; allowedProductIdsJson: unknown },
    preferredBrandId: string | null,
  ): Promise<CandidateProduct[]> {
    let products: HydratedProduct[] = [];

    if (rule.allowedProductIdsJson) {
      products = await this.products.getManyByIds(rule.allowedProductIdsJson as string[]);
    } else if (rule.categoryId) {
      const { items } = await this.products.list({ categoryId: rule.categoryId, take: 200 } as any);
      products = items as HydratedProduct[];
      if (rule.keywords) {
        const keywords = rule.keywords.split(',').map((k) => k.trim()).filter(Boolean);
        products = products.filter((p) => keywords.some((k) => p.name.includes(k)));
      }
    } else if (rule.keywords) {
      const { hits } = await this.search.searchProducts(rule.keywords, { limit: 100 });
      products = await this.products.getManyByIds((hits as { id: string }[]).map((h) => h.id));
    }

    let candidates = products.filter((p) => p.variants.length > 0).map((p) => this.toCandidate(p));

    if (preferredBrandId) {
      const brandOnly = candidates.filter((c) => c.brandId === preferredBrandId);
      // Only narrow to the preferred brand if it actually has a real match —
      // otherwise fall back to the full real candidate set rather than
      // returning nothing (the caller still gets an honest, real product).
      if (brandOnly.length > 0) candidates = brandOnly;
    }

    return candidates;
  }

  private toCandidate(product: HydratedProduct): CandidateProduct {
    const variant = product.variants.find((v) => v.isActive) ?? product.variants[0];
    return {
      id: product.id,
      variantId: variant.id,
      name: product.name,
      slug: product.slug,
      brandId: product.brandId,
      brandName: product.brand?.name ?? null,
      price: Number(product.basePrice),
      stock: product.totalStock,
    };
  }

  // §7/§8: nothing is added to the real cart until this explicit call, and
  // every line is re-validated against real, current Catalog data first —
  // the stored packagesJson snapshot is a display convenience, never the
  // source of truth for what actually gets added.
  async addToCart(id: string, dto: AddConsultationToCartDto, userId: string) {
    const consultation = await this.prisma.electricalConsultation.findUnique({ where: { id } });
    if (!consultation) throw new NotFoundException('مشاوره یافت نشد');
    if (consultation.userId && consultation.userId !== userId) {
      throw new ForbiddenException('شما به این مشاوره دسترسی ندارید');
    }

    if (consultation.status !== 'READY' || !consultation.packagesJson) {
      throw new BadRequestException('ابتدا باید بسته‌ی پیشنهادی ساخته شود');
    }
    const packages = consultation.packagesJson as unknown as Record<string, { lines: PackageLine[]; total: number }>;
    const chosen = packages[dto.tier];
    if (!chosen || chosen.lines.length === 0) {
      throw new BadRequestException('برای این سطح، بسته‌ی واقعی موجود نیست');
    }

    // Re-validate every line against real, current Catalog data — never
    // trust the generation-time snapshot for what actually gets added.
    const fresh = await this.products.getManyByIds(chosen.lines.map((l) => l.productId));
    const freshById = new Map(fresh.map((p) => [p.id, p]));

    const added: { itemKey: string; quantity: number }[] = [];
    const adjusted: { itemKey: string; requested: number; added: number }[] = [];
    const skipped: string[] = [];

    for (const line of chosen.lines) {
      const current = freshById.get(line.productId);
      const currentStock = current?.totalStock ?? 0;
      const quantity = Math.min(line.quantity, currentStock);
      if (!current || quantity <= 0) {
        skipped.push(line.itemKey);
        continue;
      }
      await this.cart.addItem(userId, { productId: line.productId, productVariantId: line.variantId, quantity, source: 'consultant' } as any);
      added.push({ itemKey: line.itemKey, quantity });
      if (quantity < line.quantity) adjusted.push({ itemKey: line.itemKey, requested: line.quantity, added: quantity });
    }

    const updated = await this.prisma.electricalConsultation.update({
      where: { id },
      // Claim a guest-started consultation for this now-authenticated user;
      // an already-owned consultation keeps its original owner untouched.
      data: { userId: consultation.userId ?? userId, status: 'CART_ADDED', cartAddedAt: new Date(), selectedTier: dto.tier },
    });

    return { consultation: updated, added, adjusted, skipped, cart: await this.cart.getCart(userId) };
  }
}
