import { ProductOpportunitiesService } from './product-opportunities.service';

describe('ProductOpportunitiesService', () => {
  let prisma: any;
  let service: ProductOpportunitiesService;

  beforeEach(() => {
    prisma = {
      productVariant: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ProductOpportunitiesService(prisma);
  });

  describe('bestSellingLowStock', () => {
    it('flags a real bestseller whose real remaining stock is at/under the low-stock threshold', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ productId: 'p1', stocks: [{ quantity: 2 }] }]);
      prisma.order.findMany.mockResolvedValue([{ id: 'o1' }]);
      prisma.orderItem.groupBy.mockResolvedValue([{ productId: 'p1', _sum: { quantity: 12 } }]);
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'کلید مینیاتوری' }]);

      const result = await service.bestSellingLowStock();

      expect(result).toEqual([{ productId: 'p1', name: 'کلید مینیاتوری', quantitySold: 12, stockRemaining: 2 }]);
    });

    it('never flags a product with plenty of real stock left', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ productId: 'p1', stocks: [{ quantity: 500 }] }]);
      prisma.order.findMany.mockResolvedValue([{ id: 'o1' }]);
      prisma.orderItem.groupBy.mockResolvedValue([{ productId: 'p1', _sum: { quantity: 12 } }]);

      const result = await service.bestSellingLowStock();
      expect(result).toEqual([]);
    });
  });

  describe('staleInventory', () => {
    it('flags real stock with zero real sales in the stale window, never a guess', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ productId: 'p1', stocks: [{ quantity: 30 }] }]);
      prisma.orderItem.findMany.mockResolvedValue([]); // nothing sold recently
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'راکد', createdAt: new Date() }]);

      const result = await service.staleInventory();
      expect(result).toEqual([{ productId: 'p1', name: 'راکد', stockRemaining: 30, publishedAt: expect.any(Date) }]);
    });

    it('never flags a product with zero real stock (nothing to sell, not "stale")', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ productId: 'p1', stocks: [{ quantity: 0 }] }]);
      prisma.orderItem.findMany.mockResolvedValue([]);

      const result = await service.staleInventory();
      expect(result).toEqual([]);
    });

    it('never flags a product that did sell recently', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ productId: 'p1', stocks: [{ quantity: 30 }] }]);
      prisma.orderItem.findMany.mockResolvedValue([{ productId: 'p1' }]);

      const result = await service.staleInventory();
      expect(result).toEqual([]);
    });
  });

  describe('crossSellPairs', () => {
    it('computes real co-purchase pairs from actual order history, requiring a minimum co-occurrence to count as a pattern', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }]);
      prisma.orderItem.findMany.mockResolvedValue([
        { orderId: 'o1', productId: 'p1' },
        { orderId: 'o1', productId: 'p2' },
        { orderId: 'o2', productId: 'p1' },
        { orderId: 'o2', productId: 'p2' },
        { orderId: 'o3', productId: 'p3' }, // no pairing — bought alone
      ]);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'لامپ' },
        { id: 'p2', name: 'سرپیچ' },
      ]);

      const result = await service.crossSellPairs(180, 2);

      expect(result).toEqual([{ productAId: 'p1', productAName: 'لامپ', productBId: 'p2', productBName: 'سرپیچ', coOccurrence: 2 }]);
    });

    it('never surfaces a pair below the minimum real co-occurrence threshold', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1' }]);
      prisma.orderItem.findMany.mockResolvedValue([
        { orderId: 'o1', productId: 'p1' },
        { orderId: 'o1', productId: 'p2' },
      ]);

      const result = await service.crossSellPairs(180, 2);
      expect(result).toEqual([]);
    });

    it('drops a pair touching a since-unpublished/deleted product rather than showing a broken suggestion', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);
      prisma.orderItem.findMany.mockResolvedValue([
        { orderId: 'o1', productId: 'p1' },
        { orderId: 'o1', productId: 'gone' },
        { orderId: 'o2', productId: 'p1' },
        { orderId: 'o2', productId: 'gone' },
      ]);
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'لامپ' }]); // "gone" no longer PUBLISHED

      const result = await service.crossSellPairs(180, 2);
      expect(result).toEqual([]);
    });
  });
});
