import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { StockSubscriptionsService } from '../../stock-subscriptions/stock-subscriptions.service';
import { CreateWarehouseDto, UpdateWarehouseDto, AdjustStockDto } from './dto/warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private stockSubscriptions: StockSubscriptionsService,
  ) {}

  list() {
    return this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundException('انبار یافت نشد');
    return warehouse;
  }

  create(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({ data: dto });
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    await this.get(id);
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.warehouse.delete({ where: { id } });
    return { success: true };
  }

  async stockLevels(warehouseId: string) {
    await this.get(warehouseId);
    return this.prisma.stock.findMany({
      where: { warehouseId },
      include: { productVariant: { include: { product: true } } },
    });
  }

  async adjustStock(adminId: string, warehouseId: string, dto: AdjustStockDto) {
    await this.get(warehouseId);

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.productVariantId },
      select: { productId: true },
    });
    if (!variant) throw new NotFoundException('گزینه محصول یافت نشد');

    const existing = await this.prisma.stock.findUnique({
      where: { warehouseId_productVariantId: { warehouseId, productVariantId: dto.productVariantId } },
    });
    const productStockAgg = await this.prisma.stock.aggregate({
      where: { productVariant: { productId: variant.productId } },
      _sum: { quantity: true },
    });
    const totalBefore = productStockAgg._sum.quantity ?? 0;

    const stock = await this.prisma.stock.upsert({
      where: { warehouseId_productVariantId: { warehouseId, productVariantId: dto.productVariantId } },
      create: { warehouseId, productVariantId: dto.productVariantId, quantity: Math.max(dto.quantityDelta, 0) },
      update: {},
    });

    const newQuantity = stock.quantity + dto.quantityDelta;
    if (newQuantity < 0) throw new BadRequestException('موجودی نمی‌تواند منفی شود');

    const updated = await this.prisma.stock.update({
      where: { id: stock.id },
      data: { quantity: newQuantity },
    });

    await this.auditLog.record({
      userId: adminId,
      action: 'stock.adjust',
      entityType: 'Stock',
      entityId: stock.id,
      before: { quantity: stock.quantity },
      after: { quantity: updated.quantity },
    });

    // Product-wide stock (summed across every variant/warehouse) crossed
    // from empty to available — this is the moment subscribers waited for,
    // not just this one warehouse row moving.
    const totalAfter = totalBefore - (existing?.quantity ?? 0) + updated.quantity;
    if (totalBefore <= 0 && totalAfter > 0) {
      void this.stockSubscriptions.notifyBackInStock(variant.productId).catch(() => undefined);
    }

    return updated;
  }
}
