import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { CreateWarehouseDto, UpdateWarehouseDto, AdjustStockDto } from './dto/warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
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

    return updated;
  }
}
