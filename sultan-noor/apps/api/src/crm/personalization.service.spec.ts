import { PersonalizationService } from './personalization.service';

function hydratedProduct(overrides: Partial<{ id: string; avgRating: number; totalStock: number }> = {}) {
  return { id: 'p1', name: 'لامپ LED', avgRating: 4, totalStock: 10, ...overrides } as any;
}

describe('PersonalizationService — catalog-grounded, own-data-only recommendations (§5/§6)', () => {
  let prisma: any;
  let products: any;
  let service: PersonalizationService;

  beforeEach(() => {
    prisma = {
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      activityLog: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    products = {
      bestSellers: jest.fn().mockResolvedValue([hydratedProduct({ id: 'best1' })]),
      getManyByIds: jest.fn().mockResolvedValue([]),
    };
    service = new PersonalizationService(prisma, products);
  });

  it('falls back to real, honest bestsellers when the customer has no real purchase or view signal yet', async () => {
    const result = await service.recommendationsForUser('u1');

    expect(result.personalized).toBe(false);
    expect(result.source).toBe('BESTSELLERS');
    expect(products.bestSellers).toHaveBeenCalled();
    expect(products.getManyByIds).not.toHaveBeenCalled();
  });

  it('builds real personalized candidates from the customer own real purchase categories, excluding already-purchased products', async () => {
    prisma.orderItem.findMany
      .mockResolvedValueOnce([{ product: { categoryId: 'c1' } }]) // realPurchasedCategoryIds (called first)
      .mockResolvedValueOnce([{ productId: 'p1' }]); // realPurchasedProductIds (called second)
    prisma.product.findMany.mockResolvedValueOnce([{ id: 'p2' }, { id: 'p3' }]); // candidate query
    products.getManyByIds.mockResolvedValue([
      hydratedProduct({ id: 'p2', avgRating: 3, totalStock: 5 }),
      hydratedProduct({ id: 'p3', avgRating: 5, totalStock: 1 }),
    ]);

    const result = await service.recommendationsForUser('u1');

    expect(result.personalized).toBe(true);
    expect(result.source).toBe('PURCHASE_HISTORY');
    const candidateWhere = prisma.product.findMany.mock.calls[0][0].where;
    expect(candidateWhere.status).toBe('PUBLISHED');
    expect(candidateWhere.id.notIn).toEqual(['p1']);
    expect(result.products[0].id).toBe('p3'); // higher real rating ranked first
  });

  it('falls back to bestsellers when the candidate query yields no real published products', async () => {
    prisma.orderItem.findMany
      .mockResolvedValueOnce([{ product: { categoryId: 'c1' } }]) // purchased category ids (called first)
      .mockResolvedValueOnce([]); // purchased product ids (called second)
    prisma.product.findMany.mockResolvedValueOnce([]); // no candidates left

    const result = await service.recommendationsForUser('u1');

    expect(result.source).toBe('BESTSELLERS');
    expect(result.personalized).toBe(false);
  });

  it('derives view-based categories only from this same real userId — never a client-supplied other user', async () => {
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.activityLog.findMany.mockResolvedValueOnce([{ metadata: { productId: 'v1' } }]);
    prisma.product.findMany
      .mockResolvedValueOnce([{ categoryId: 'c9' }]) // resolve viewed product -> category
      .mockResolvedValueOnce([]); // candidate query (empty -> fallback)

    await service.recommendationsForUser('u1');

    const activityWhere = prisma.activityLog.findMany.mock.calls[0][0].where;
    expect(activityWhere.userId).toBe('u1');
    expect(activityWhere.event).toBe('product.view');
  });
});
