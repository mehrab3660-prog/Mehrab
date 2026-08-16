import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';

function buildProduct(id: string, variantIds: string[]) {
  return {
    id,
    variants: variantIds.map((vid) => ({ id: vid })),
  };
}

describe('ProductsService', () => {
  let prisma: any;
  let search: any;
  let service: ProductsService;

  beforeEach(() => {
    prisma = {
      product: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      review: { groupBy: jest.fn().mockResolvedValue([]) },
      stock: { findMany: jest.fn().mockResolvedValue([]) },
    };
    search = {};
    service = new ProductsService(prisma, search);
  });

  describe('get() — stock aggregation', () => {
    it('sums available (quantity - reserved) stock across every variant/warehouse for the product', async () => {
      prisma.product.findFirst.mockResolvedValue(buildProduct('p1', ['v1', 'v2']));
      prisma.stock.findMany.mockResolvedValue([
        { productVariantId: 'v1', quantity: 10, reservedQuantity: 2 }, // warehouse A
        { productVariantId: 'v1', quantity: 5, reservedQuantity: 0 }, // warehouse B, same variant
        { productVariantId: 'v2', quantity: 3, reservedQuantity: 1 },
      ]);

      const result = await service.get('p1');
      // v1: (10-2) + (5-0) = 13, v2: (3-1) = 2 → total 15
      expect(result.totalStock).toBe(15);
    });

    it('never lets a single row with reserved > quantity push the total negative', async () => {
      prisma.product.findFirst.mockResolvedValue(buildProduct('p1', ['v1']));
      prisma.stock.findMany.mockResolvedValue([{ productVariantId: 'v1', quantity: 3, reservedQuantity: 5 }]);

      const result = await service.get('p1');
      expect(result.totalStock).toBe(0);
    });

    it('reports zero stock (not undefined/NaN) for a product with no stock rows at all', async () => {
      prisma.product.findFirst.mockResolvedValue(buildProduct('p1', ['v1']));
      prisma.stock.findMany.mockResolvedValue([]);

      const result = await service.get('p1');
      expect(result.totalStock).toBe(0);
    });

    it('throws NotFoundException for a missing product', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.get('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list() — public visibility', () => {
    it('forces status=PUBLISHED for anonymous/customer callers regardless of the requested status filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.list({ status: 'DRAFT' } as any, undefined);

      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PUBLISHED');
    });

    it('lets staff requesters see the status filter they asked for', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.list({ status: 'DRAFT' } as any, { role: 'ADMIN' } as any);

      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('DRAFT');
    });
  });
});
