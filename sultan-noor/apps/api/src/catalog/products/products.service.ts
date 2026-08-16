import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchService } from '../../search/search.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';

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
    return { items: await this.withRatings(items), total };
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
    return withRating;
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
