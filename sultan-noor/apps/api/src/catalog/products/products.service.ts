import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchService } from '../../search/search.service';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';

const productInclude = {
  brand: true,
  category: true,
  images: { orderBy: { position: 'asc' as const } },
  variants: true,
};

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private search: SearchService,
  ) {}

  async list(query: ListProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      categoryId: query.categoryId,
      brandId: query.brandId,
      status: query.status ?? 'PUBLISHED',
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
    return { items, total };
  }

  async get(idOrSlug: string) {
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        ...productInclude,
        supplier: true,
        priceTiers: { include: { customerGroup: true } },
      },
    });
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
    await this.get(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: productInclude,
    });
    await this.reindex(product.id);
    return product;
  }

  async remove(id: string) {
    await this.get(id);
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
