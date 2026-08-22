import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ProductsService } from '../catalog/products/products.service';
import { CreateSceneHotspotDto, UpdateSceneHotspotDto } from './dto/scene-hotspot.dto';

@Injectable()
export class SceneService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private products: ProductsService,
  ) {}

  // "false" is the only value that turns the 3D layer off — unset means ON,
  // matching every other feature-enable flag in this project (Sprint 9 §24).
  async getPublicConfig() {
    const value = await this.settings.resolve('site3dEnabled');
    return { enabled: value !== 'false' };
  }

  // The 3D scene is presentation-only: a hotspot whose product no longer
  // exists or isn't PUBLISHED is silently dropped rather than shown with
  // stale/fake data (Sprint 9 §5/§19 — no fake products, ever).
  async listPublicHotspots() {
    const hotspots = await this.prisma.sceneHotspot.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
    if (hotspots.length === 0) return [];

    const products = await this.products.getManyByIds(hotspots.map((h) => h.productId));
    const productById = new Map(products.map((p) => [p.id, p]));

    return hotspots
      .filter((h) => productById.has(h.productId))
      .map((h) => {
        const p = productById.get(h.productId)!;
        return {
          id: h.id,
          label: h.label,
          icon: h.icon,
          position: { x: h.positionX, y: h.positionY, z: h.positionZ },
          product: {
            id: p.id,
            name: p.name,
            slug: p.slug,
            brand: p.brand?.name ?? null,
            price: Number(p.basePrice),
            inStock: p.totalStock > 0,
            stock: p.totalStock,
            imageUrl: p.images?.[0]?.url ?? null,
            avgRating: p.avgRating,
            reviewCount: p.reviewCount,
          },
        };
      });
  }

  listAdmin() {
    return this.prisma.sceneHotspot.findMany({
      orderBy: { order: 'asc' },
      include: { product: { select: { id: true, name: true, slug: true, status: true } } },
    });
  }

  private async assertRealProduct(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new BadRequestException('محصول انتخاب‌شده در کاتالوگ واقعی یافت نشد');
  }

  async create(dto: CreateSceneHotspotDto) {
    await this.assertRealProduct(dto.productId);
    return this.prisma.sceneHotspot.create({
      data: {
        label: dto.label,
        icon: dto.icon ?? '💡',
        positionX: dto.positionX,
        positionY: dto.positionY,
        positionZ: dto.positionZ,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
        productId: dto.productId,
      },
    });
  }

  async update(id: string, dto: UpdateSceneHotspotDto) {
    const existing = await this.prisma.sceneHotspot.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('نقطه تعاملی یافت نشد');
    if (dto.productId) await this.assertRealProduct(dto.productId);
    return this.prisma.sceneHotspot.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.sceneHotspot.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('نقطه تعاملی یافت نشد');
    await this.prisma.sceneHotspot.delete({ where: { id } });
    return { success: true };
  }
}
