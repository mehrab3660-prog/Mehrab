import { BadRequestException } from '@nestjs/common';
import { ReorderRecommendationService } from './reorder-recommendation.service';

function forecastRow(overrides: Partial<Record<string, unknown>> = {}) {
  return { productId: 'p1', productName: 'لامپ', currentStock: 3, avgDailySales: 2, daysRemaining: 1.5, riskLevel: 'CRITICAL', suggestedReorderQuantity: 25, ...overrides };
}

describe('ReorderRecommendationService — AI never places a real purchase order itself (§2)', () => {
  let prisma: any;
  let auditLog: any;
  let activityLog: any;
  let notifications: any;
  let forecast: any;
  let service: ReorderRecommendationService;

  beforeEach(() => {
    prisma = {
      reorderRecommendation: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      product: { findUnique: jest.fn() },
      productVariant: { findFirst: jest.fn() },
      purchaseOrderItem: { findFirst: jest.fn() },
      purchaseOrder: { create: jest.fn() },
      stock: { findFirst: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    activityLog = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    forecast = { forecast: jest.fn().mockResolvedValue({ forecasts: [] }) };
    service = new ReorderRecommendationService(prisma, auditLog, activityLog, notifications, forecast);
  });

  describe('generate', () => {
    it('only ever creates a PENDING_REVIEW suggestion — never an order — from a real critical/low forecast', async () => {
      forecast.forecast.mockResolvedValue({ forecasts: [forecastRow()] });
      prisma.reorderRecommendation.create.mockResolvedValue({ id: 'r1', status: 'PENDING_REVIEW' });

      await service.generate();

      expect(prisma.reorderRecommendation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ productId: 'p1' }) }),
      );
      expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
    });

    it('never creates a duplicate recommendation for a product that already has a real pending one', async () => {
      forecast.forecast.mockResolvedValue({ forecasts: [forecastRow()] });
      prisma.reorderRecommendation.findFirst.mockResolvedValue({ id: 'existing' });

      const created = await service.generate();

      expect(created).toHaveLength(0);
      expect(prisma.reorderRecommendation.create).not.toHaveBeenCalled();
    });

    it('ignores a NORMAL-risk forecast row — no recommendation for healthy stock', async () => {
      forecast.forecast.mockResolvedValue({ forecasts: [forecastRow({ riskLevel: 'NORMAL' })] });

      const created = await service.generate();

      expect(created).toHaveLength(0);
    });

    it('notifies real staff users only for a CRITICAL recommendation, never for LOW', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'staff1' }]);
      prisma.reorderRecommendation.create.mockResolvedValue({ id: 'r1', productName: 'لامپ', daysRemaining: 1.5 });

      forecast.forecast.mockResolvedValue({ forecasts: [forecastRow({ riskLevel: 'CRITICAL' })] });
      await service.generate();
      expect(notifications.notify).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      prisma.reorderRecommendation.findFirst.mockResolvedValue(null);
      prisma.reorderRecommendation.create.mockResolvedValue({ id: 'r2' });
      forecast.forecast.mockResolvedValue({ forecasts: [forecastRow({ riskLevel: 'LOW' })] });
      await service.generate();
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('approve — never fabricates a supplier, cost, or purchase order', () => {
    it('rejects approving anything not PENDING_REVIEW', async () => {
      prisma.reorderRecommendation.findUnique.mockResolvedValue({ id: 'r1', status: 'APPROVED' });
      await expect(service.approve('r1')).rejects.toThrow(BadRequestException);
    });

    it('approves without creating a real purchase order when the product has no real supplier on file', async () => {
      prisma.reorderRecommendation.findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING_REVIEW', productId: 'p1' });
      prisma.product.findUnique.mockResolvedValue({ supplierId: null });
      prisma.reorderRecommendation.update.mockResolvedValue({ id: 'r1', status: 'APPROVED' });

      const result = await service.approve('r1', 'admin1');

      expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
      expect(prisma.reorderRecommendation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', purchaseOrderId: undefined }) }),
      );
      expect(result.executionNote).toContain('تامین‌کننده');
    });

    it('approves without creating a real purchase order when there is no real historical unit cost — never a fabricated price', async () => {
      prisma.reorderRecommendation.findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING_REVIEW', productId: 'p1' });
      prisma.product.findUnique.mockResolvedValue({ supplierId: 'sup1' });
      prisma.productVariant.findFirst.mockResolvedValue({ id: 'v1' });
      prisma.purchaseOrderItem.findFirst.mockResolvedValue(null); // no real cost history
      prisma.reorderRecommendation.update.mockResolvedValue({ id: 'r1', status: 'APPROVED' });

      const result = await service.approve('r1', 'admin1');

      expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
      expect(result.executionNote).toContain('هزینه خرید واقعی');
    });

    it('creates a real DRAFT purchase order using the real last-paid unit cost when supplier and cost history both exist', async () => {
      prisma.reorderRecommendation.findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING_REVIEW', productId: 'p1', suggestedQuantity: 25 });
      prisma.product.findUnique.mockResolvedValue({ supplierId: 'sup1' });
      prisma.productVariant.findFirst.mockResolvedValue({ id: 'v1' });
      prisma.purchaseOrderItem.findFirst.mockResolvedValue({ unitCost: 42000 });
      prisma.stock.findFirst.mockResolvedValue({ warehouseId: 'wh1' });
      prisma.purchaseOrder.create.mockResolvedValue({ id: 'po1' });
      prisma.reorderRecommendation.update.mockResolvedValue({ id: 'r1', status: 'EXECUTED', purchaseOrderId: 'po1' });

      const result = await service.approve('r1', 'admin1');

      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith({
        data: {
          supplierId: 'sup1',
          warehouseId: 'wh1',
          status: 'DRAFT',
          items: { create: [{ productVariantId: 'v1', quantity: 25, unitCost: 42000 }] },
        },
      });
      expect(prisma.reorderRecommendation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'EXECUTED', purchaseOrderId: 'po1' }) }),
      );
      expect(result.purchaseOrderId).toBe('po1');
    });

    it('falls back to any real active warehouse when the variant has no existing stock row anywhere', async () => {
      prisma.reorderRecommendation.findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING_REVIEW', productId: 'p1', suggestedQuantity: 10 });
      prisma.product.findUnique.mockResolvedValue({ supplierId: 'sup1' });
      prisma.productVariant.findFirst.mockResolvedValue({ id: 'v1' });
      prisma.purchaseOrderItem.findFirst.mockResolvedValue({ unitCost: 1000 });
      prisma.stock.findFirst.mockResolvedValue(null);
      prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh-fallback' });
      prisma.purchaseOrder.create.mockResolvedValue({ id: 'po1' });
      prisma.reorderRecommendation.update.mockResolvedValue({});

      await service.approve('r1');

      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ warehouseId: 'wh-fallback' }) }));
    });
  });

  describe('reject', () => {
    it('rejects rejecting anything not PENDING_REVIEW', async () => {
      prisma.reorderRecommendation.findUnique.mockResolvedValue({ id: 'r1', status: 'EXECUTED' });
      await expect(service.reject('r1', 'دلیل')).rejects.toThrow(BadRequestException);
    });

    it('records a real audit entry with the rejection reason', async () => {
      prisma.reorderRecommendation.findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING_REVIEW' });
      prisma.reorderRecommendation.update.mockResolvedValue({ id: 'r1', status: 'REJECTED' });

      await service.reject('r1', 'موجودی انبار کافی است', 'admin1');

      expect(prisma.reorderRecommendation.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'موجودی انبار کافی است' }),
      });
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'inventory.reorder_rejected' }));
    });
  });
});
