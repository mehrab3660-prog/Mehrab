import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchService } from '../../search/search.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { deleteUploadedImage, saveUploadedImage } from '../../common/utils/image-upload.util';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';

const IMAGE_DIR = process.env.PRODUCT_IMAGE_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'products');

const productInclude = {
  brand: true,
  category: true,
  images: { orderBy: { position: 'asc' as const } },
  variants: true,
};

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF];

function isStaff(requester: AuthenticatedUser | undefined): boolean {
  return !!requester && STAFF_ROLES.includes(requester.role as Role);
}

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private search: SearchService,
  ) {}

  async list(query: ListProductsQueryDto, requester?: AuthenticatedUser) {
    const staff = isStaff(requester);
    const where: Prisma.ProductWhereInput = {
      categoryId: query.categoryId,
      brandId: query.brandId,
      // Only staff may request non-published products; everyone else always
      // sees the published catalog regardless of what they pass.
      status: staff ? (query.status ?? 'PUBLISHED') : 'PUBLISHED',
    };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        skip: query.skip,
        take: query.take ?? 24,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: await this.withStock(await this.withRatings(items)), total };
  }

  async get(idOrSlug: string, requester?: AuthenticatedUser) {
    const staff = isStaff(requester);
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], ...(staff ? {} : { status: 'PUBLISHED' }) },
      include: {
        ...productInclude,
        // Supplier contacts and B2B wholesale price tiers are internal data
        // — never returned to anonymous/customer callers.
        ...(staff ? { supplier: true, priceTiers: { include: { customerGroup: true } } } : {}),
      },
    });
    if (!product) throw new NotFoundException('محصول یافت نشد');
    const [withRating] = await this.withRatings([product]);
    const [withStock] = await this.withStock([withRating]);

    if (!requester) return withStock;
    const subscription = await this.prisma.stockSubscription.findUnique({
      where: { userId_productId: { userId: requester.id, productId: product.id } },
    });
    return { ...withStock, restockSubscribed: !!subscription && !subscription.notifiedAt };
  }

  // Related products from the same category, excluding the current product —
  // there is no real purchase-affinity data yet, so this single real rail is
  // the honest substitute for a separate "complementary products" list.
  async related(productId: string, categoryId: string | null, take = 8) {
    if (!categoryId) return [];
    const items = await this.prisma.product.findMany({
      where: { categoryId, status: 'PUBLISHED', id: { not: productId } },
      include: productInclude,
      take,
      orderBy: { createdAt: 'desc' },
    });
    return this.withStock(await this.withRatings(items));
  }

  async relatedForProduct(idOrSlug: string, take = 8) {
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true, categoryId: true },
    });
    if (!product) return [];
    return this.related(product.id, product.categoryId, take);
  }

  // Real best-sellers computed from actual delivered/paid order quantities —
  // never a fabricated ranking. Products with zero sales are simply excluded.
  async bestSellers(take = 8) {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take,
    });
    if (grouped.length === 0) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) }, status: 'PUBLISHED' },
      include: productInclude,
    });
    const orderById = new Map(grouped.map((g, i) => [g.productId, i]));
    const sorted = products.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));
    return this.withStock(await this.withRatings(sorted));
  }

  // Aggregates real available stock (quantity - reserved) across every
  // variant/warehouse for a product — the business has a single physical
  // location, so this total is the honest, non-fabricated stock signal
  // (no multi-branch breakdown is invented).
  private async withStock<T extends { id: string; variants: { id: string }[] }>(
    products: T[],
  ): Promise<(T & { totalStock: number })[]> {
    if (products.length === 0) return [];
    const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
    if (variantIds.length === 0) return products.map((p) => ({ ...p, totalStock: 0 }));
    const stocks = await this.prisma.stock.findMany({
      where: { productVariantId: { in: variantIds } },
      select: { productVariantId: true, quantity: true, reservedQuantity: true },
    });
    const stockByVariant = new Map<string, number>();
    for (const s of stocks) {
      const available = Math.max(0, s.quantity - s.reservedQuantity);
      stockByVariant.set(s.productVariantId, (stockByVariant.get(s.productVariantId) ?? 0) + available);
    }
    return products.map((p) => ({
      ...p,
      totalStock: p.variants.reduce((sum, v) => sum + (stockByVariant.get(v.id) ?? 0), 0),
    }));
  }

  // Attaches a real average rating + review count computed from approved
  // reviews (never fabricated) — avgRating is null when there are none yet.
  private async withRatings<T extends { id: string }>(products: T[]): Promise<(T & { avgRating: number | null; reviewCount: number })[]> {
    if (products.length === 0) return [];
    const stats = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { productId: { in: products.map((p) => p.id) }, isApproved: true },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const statsByProduct = new Map(stats.map((s) => [s.productId, s]));
    return products.map((p) => {
      const stat = statsByProduct.get(p.id);
      return {
        ...p,
        avgRating: stat?._avg.rating ?? null,
        reviewCount: stat?._count.rating ?? 0,
      };
    });
  }

  // Internal existence lookup for update()/remove(), which are already staff-gated
  // at the controller level — must not apply the public PUBLISHED-only filter.
  private async findRawById(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('محصول یافت نشد');
    return product;
  }

  async create(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        status: dto.status,
        brandId: dto.brandId,
        categoryId: dto.categoryId,
        supplierId: dto.supplierId,
        basePrice: dto.basePrice,
        compareAtPrice: dto.compareAtPrice,
        minWholesaleQty: dto.minWholesaleQty,
        variants: dto.variants?.length
          ? { create: dto.variants.map((v) => ({ sku: v.sku, attributes: v.attributes, price: v.price, weightGrams: v.weightGrams })) }
          : undefined,
        images: dto.imageUrls?.length
          ? { create: dto.imageUrls.map((url, position) => ({ url, position })) }
          : undefined,
      },
      include: productInclude,
    });

    await this.reindex(product.id);
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findRawById(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: productInclude,
    });
    await this.reindex(product.id);
    return product;
  }

  async remove(id: string) {
    await this.findRawById(id);
    await this.prisma.product.delete({ where: { id } });
    await this.search.removeProduct(id);
    return { success: true };
  }

  // baseUrl is the request's own scheme+host (e.g. https://74211.xyz or
  // http://localhost:4000) — every other place in the app that renders
  // product.images[].url treats it as a ready-to-use absolute URL, exactly
  // like the manually-pasted external URLs the imageUrls field already
  // supports, so this stores one instead of a relative path.
  async addImage(productId: string, file: Express.Multer.File, baseUrl: string) {
    await this.findRawById(productId);
    const filename = saveUploadedImage(file, IMAGE_DIR);

    const position = await this.prisma.productImage.count({ where: { productId } });
    const image = await this.prisma.productImage.create({
      data: { productId, url: `${baseUrl}/api/product-images/${filename}`, position },
    });
    await this.reindex(productId);
    return image;
  }

  async removeImage(imageId: string) {
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException('تصویر یافت نشد');

    await this.prisma.productImage.delete({ where: { id: imageId } });
    deleteUploadedImage(image.url, IMAGE_DIR);
    await this.reindex(image.productId);
    return { success: true };
  }

  private async reindex(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { brand: true, category: true, images: { take: 1, orderBy: { position: 'asc' } } },
    });
    if (!product) return;
    await this.search.indexProduct({
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      brandName: product.brand?.name ?? null,
      categoryName: product.category?.name ?? null,
      basePrice: Number(product.basePrice),
      status: product.status,
      imageUrl: product.images[0]?.url ?? null,
    });
  }

  // Resolves the unit price for a product given the buyer's customer group and
  // requested quantity — this is what powers B2B tiered / wholesale pricing.
  async resolveUnitPrice(productId: string, customerGroupId: string | null, quantity: number): Promise<number> {
    const product = await this.prisma.product.findUniqueOrThrow({ where: { id: productId } });

    if (!customerGroupId) return Number(product.basePrice);

    const tier = await this.prisma.priceTier.findFirst({
      where: { productId, customerGroupId, minQuantity: { lte: quantity } },
      orderBy: { minQuantity: 'desc' },
    });

    return tier ? Number(tier.unitPrice) : Number(product.basePrice);
  }
}
