import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReorderRecommendation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryForecastService } from './inventory-forecast.service';

const RISK_LABEL_FA: Record<string, string> = { CRITICAL: 'بحرانی', LOW: 'رو به اتمام', REVIEW: 'نیاز به بررسی', NORMAL: 'عادی' };
const TRIGGER_RISK_LEVELS = ['CRITICAL', 'LOW'];

// AI never places a purchase order itself (§2 non-negotiable): generate()
// only ever creates a PENDING_REVIEW suggestion from the real forecast.
// approve() is the single place a real PurchaseOrder can be created, and
// even then only when a real supplier AND a real historical unit cost
// exist — never a fabricated price. Mirrors the approve/reject workflow
// shape already used by SalesRecommendation/ProductSeoSuggestion/etc.
@Injectable()
export class ReorderRecommendationService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private activityLog: ActivityLogService,
    private notifications: NotificationsService,
    private forecast: InventoryForecastService,
  ) {}

  list(status?: string) {
    return this.prisma.reorderRecommendation.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const rec = await this.prisma.reorderRecommendation.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('پیشنهاد خرید مجدد یافت نشد');
    return rec;
  }

  // Idempotent: a product already holding a real PENDING_REVIEW
  // recommendation never gets a duplicate one from a re-run.
  async generate(days?: number) {
    const { forecasts } = await this.forecast.forecast(days);
    const triggerable = forecasts.filter((f) => TRIGGER_RISK_LEVELS.includes(f.riskLevel));

    const created: ReorderRecommendation[] = [];
    for (const f of triggerable) {
      const existing = await this.prisma.reorderRecommendation.findFirst({ where: { productId: f.productId, status: 'PENDING_REVIEW' } });
      if (existing) continue;

      const reasoning = `میانگین فروش روزانه واقعی ${f.avgDailySales} عدد است؛ با موجودی واقعی فعلی ${f.currentStock} عدد، طی حدود ${f.daysRemaining} روز آینده به سطح ${RISK_LABEL_FA[f.riskLevel]} می‌رسد.`;
      const rec = await this.prisma.reorderRecommendation.create({
        data: {
          productId: f.productId,
          productName: f.productName,
          currentStock: f.currentStock,
          avgDailySales: f.avgDailySales,
          daysRemaining: f.daysRemaining,
          riskLevel: f.riskLevel,
          suggestedQuantity: f.suggestedReorderQuantity,
          reasoning,
        },
      });
      created.push(rec);
      await this.activityLog.record({ event: 'inventory.reorder_recommended', metadata: { productId: f.productId, riskLevel: f.riskLevel } });

      if (f.riskLevel === 'CRITICAL') {
        await this.notifyStaff(rec.productName, rec.daysRemaining ?? 0);
      }
    }
    return created;
  }

  async approve(id: string, userId?: string) {
    const rec = await this.getById(id);
    if (rec.status !== 'PENDING_REVIEW') throw new BadRequestException('این پیشنهاد قابل تأیید نیست');

    const product = await this.prisma.product.findUnique({ where: { id: rec.productId }, select: { supplierId: true } });
    let purchaseOrderId: string | undefined;
    let executionNote: string;

    if (!product?.supplierId) {
      executionNote = 'این محصول تامین‌کننده ثبت‌شده‌ای ندارد؛ سفارش خرید واقعی ساخته نشد — فقط پیشنهاد تأیید شد و باید دستی پیگیری شود.';
    } else {
      const variant = await this.prisma.productVariant.findFirst({ where: { productId: rec.productId }, select: { id: true } });
      const lastCostItem = variant
        ? await this.prisma.purchaseOrderItem.findFirst({ where: { productVariantId: variant.id }, orderBy: { id: 'desc' }, select: { unitCost: true } })
        : null;

      if (!variant || !lastCostItem) {
        executionNote = 'سابقه‌ی هزینه خرید واقعی برای این محصول ثبت نشده — سفارش خرید واقعی ساخته نشد تا هزینه‌ای جعلی درج نشود؛ باید دستی از بخش تامین‌کنندگان ثبت شود.';
      } else {
        const warehouseId = await this.pickWarehouseId(variant.id);
        const po = await this.prisma.purchaseOrder.create({
          data: {
            supplierId: product.supplierId,
            warehouseId,
            status: 'DRAFT',
            items: { create: [{ productVariantId: variant.id, quantity: rec.suggestedQuantity, unitCost: lastCostItem.unitCost }] },
          },
        });
        purchaseOrderId = po.id;
        executionNote = `یک سفارش خرید واقعی (وضعیت پیش‌نویس) بر اساس آخرین هزینه واحد واقعی ثبت‌شده ساخته شد — قابل بررسی در بخش تامین‌کنندگان.`;
      }
    }

    const updated = await this.prisma.reorderRecommendation.update({
      where: { id },
      data: { status: purchaseOrderId ? 'EXECUTED' : 'APPROVED', purchaseOrderId, reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'inventory.reorder_approved', entityType: 'ReorderRecommendation', entityId: id, before: rec, after: updated });
    return { ...updated, executionNote };
  }

  async reject(id: string, reason: string | undefined, userId?: string) {
    const rec = await this.getById(id);
    if (rec.status !== 'PENDING_REVIEW') throw new BadRequestException('این پیشنهاد قابل رد کردن نیست');
    const updated = await this.prisma.reorderRecommendation.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'inventory.reorder_rejected', entityType: 'ReorderRecommendation', entityId: id, before: rec, after: updated });
    return updated;
  }

  private async pickWarehouseId(variantId: string): Promise<string> {
    const stock = await this.prisma.stock.findFirst({ where: { productVariantId: variantId }, orderBy: { quantity: 'desc' }, select: { warehouseId: true } });
    if (stock) return stock.warehouseId;
    const warehouse = await this.prisma.warehouse.findFirst({ where: { isActive: true }, select: { id: true } });
    if (!warehouse) throw new BadRequestException('هیچ انبار فعالی برای ثبت سفارش خرید یافت نشد');
    return warehouse.id;
  }

  private async notifyStaff(productName: string, daysRemaining: number) {
    const staff = await this.prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'STAFF'] } }, select: { id: true } });
    await Promise.all(
      staff.map((s) =>
        this.notifications.notify(
          s.id,
          'SYSTEM',
          'موجودی بحرانی',
          `موجودی «${productName}» طی حدود ${daysRemaining} روز آینده به پایان می‌رسد. لطفاً پیشنهاد خرید مجدد را بررسی کنید.`,
        ),
      ),
    );
  }
}
