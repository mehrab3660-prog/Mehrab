import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ElectricalConsultantService } from './electrical-consultant.service';

function readyConsultation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c1',
    userId: null,
    status: 'COLLECTING_INFO',
    areaSqm: 120,
    bedrooms: 2,
    livingRooms: 1,
    kitchens: 1,
    bathrooms: 2,
    otherRooms: 0,
    hasStaircase: false,
    cheapestOnly: false,
    higherQuality: false,
    preferredBrandId: null,
    packagesJson: null,
    noMatchItemKeysJson: null,
    ...overrides,
  };
}

function hydratedProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    name: 'کلید تک‌پل',
    slug: 'switch-1',
    brandId: 'b1',
    brand: { name: 'برند تست' },
    basePrice: 40_000 as any,
    totalStock: 50,
    variants: [{ id: 'v1', isActive: true }],
    ...overrides,
  };
}

describe('ElectricalConsultantService', () => {
  let prisma: any;
  let search: any;
  let settings: any;
  let products: any;
  let cart: any;
  let activityLog: any;
  let service: ElectricalConsultantService;

  beforeEach(() => {
    prisma = {
      electricalConsultation: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      consultantItemRule: { findMany: jest.fn().mockResolvedValue([]) },
      brand: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    search = { searchProducts: jest.fn().mockResolvedValue({ hits: [] }) };
    settings = { resolve: jest.fn().mockResolvedValue(null) };
    products = { list: jest.fn().mockResolvedValue({ items: [], total: 0 }), getManyByIds: jest.fn().mockResolvedValue([]) };
    cart = { addItem: jest.fn().mockResolvedValue({}), getCart: jest.fn().mockResolvedValue({ items: [] }) };
    activityLog = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ElectricalConsultantService(prisma, search, settings, products, cart, activityLog);
  });

  describe('start', () => {
    it('refuses to start once the admin has disabled the consultant', async () => {
      settings.resolve.mockResolvedValue('false');
      await expect(service.start('u1')).rejects.toThrow(BadRequestException);
      expect(prisma.electricalConsultation.create).not.toHaveBeenCalled();
    });

    it('creates a real consultation row and records a real usage event', async () => {
      prisma.electricalConsultation.create.mockResolvedValue(
        readyConsultation({ id: 'new1', userId: 'u1', areaSqm: null, bedrooms: null, livingRooms: null, kitchens: null, bathrooms: null }),
      );
      const result = await service.start('u1');
      expect(result.missingFields).toEqual(['areaSqm', 'bedrooms', 'livingRooms', 'kitchens', 'bathrooms']);
      expect(result.readyToGenerate).toBe(false);
      expect(activityLog.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'consultant.consultation_started' }));
    });
  });

  describe('ownership / IDOR (§15)', () => {
    it('throws NotFoundException for a consultation that does not exist', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(null);
      await expect(service.getById('missing', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('never lets one logged-in user read another user\'s consultation', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(readyConsultation({ userId: 'owner' }));
      await expect(service.getById('c1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('lets a guest-owned consultation (userId null) be read by its unguessable id — same trust model as the AI advisor', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(readyConsultation({ userId: null }));
      await expect(service.getById('c1', 'anyone')).resolves.toBeDefined();
    });
  });

  describe('generatePackages — catalog-only, never fabricated (§4/§5/§6)', () => {
    it('refuses to generate — never guesses — while required fields are still missing', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(readyConsultation({ bathrooms: null }));
      await expect(service.generatePackages('c1')).rejects.toThrow(BadRequestException);
    });

    it('builds real, priced package lines only from real ConsultantItemRule + real hydrated Catalog products', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(readyConsultation());
      prisma.consultantItemRule.findMany.mockResolvedValue([
        { id: 'r1', itemKey: 'LAMP', label: 'لامپ', categoryId: 'cat1', keywords: null, minQuantity: 1, maxQuantity: null, priorityBrandIds: null, allowedProductIdsJson: null },
      ]);
      products.list.mockResolvedValue({ items: [hydratedProduct({ id: 'lamp1', name: 'لامپ LED', slug: 'lamp' })], total: 1 });
      prisma.electricalConsultation.update.mockResolvedValue(readyConsultation({ status: 'READY' }));

      const result = await service.generatePackages('c1');

      expect(result.packages.ECONOMIC?.lines.some((l) => l.productId === 'lamp1')).toBe(true);
      expect(result.safetyDisclaimer).toContain('برقکار');
    });

    it('honestly reports item types with real quantity but no matching rule as no-match — never invents a category mapping', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(readyConsultation());
      prisma.consultantItemRule.findMany.mockResolvedValue([]); // no rules configured at all

      const result = await service.generatePackages('c1');

      expect(result.noMatchItemKeys).toContain('LAMP');
      expect(result.noMatchItemKeys).toContain('SWITCH');
      expect(Object.keys(result.packages)).toHaveLength(0);
    });

    it('never fabricates a tier: a tier with zero real matching lines is simply absent from the result (§3)', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(readyConsultation());
      prisma.consultantItemRule.findMany.mockResolvedValue([
        { id: 'r1', itemKey: 'LAMP', label: 'لامپ', categoryId: 'cat1', keywords: null, minQuantity: 1, maxQuantity: null, priorityBrandIds: null, allowedProductIdsJson: null },
      ]);
      products.list.mockResolvedValue({ items: [], total: 0 }); // no real product at all

      const result = await service.generatePackages('c1');

      expect(result.packages).toEqual({});
      expect(result.noMatchItemKeys).toContain('LAMP');
    });

    it('substitutes a real cheaper/pricier real candidate when the ideal one lacks stock, never a fabricated product (§6)', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(readyConsultation());
      prisma.consultantItemRule.findMany.mockResolvedValue([
        { id: 'r1', itemKey: 'LAMP', label: 'لامپ', categoryId: 'cat1', keywords: null, minQuantity: 1, maxQuantity: null, priorityBrandIds: null, allowedProductIdsJson: null },
      ]);
      products.list.mockResolvedValue({
        items: [
          hydratedProduct({ id: 'out-of-stock', name: 'لامپ کم‌موجود', slug: 'a', basePrice: 100_000 as any, totalStock: 0 }),
          hydratedProduct({ id: 'real-alt', name: 'لامپ جایگزین واقعی', slug: 'b', basePrice: 110_000 as any, totalStock: 100 }),
        ],
        total: 2,
      });

      const result = await service.generatePackages('c1');

      const line = result.packages.ECONOMIC?.lines.find((l) => l.itemKey === 'LAMP');
      expect(line?.productId).toBe('real-alt');
    });

    it('applies "ارزان‌ترین" (cheapestOnly) by always picking the real cheapest candidate, even for the standard/professional tiers', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(readyConsultation({ cheapestOnly: true }));
      prisma.consultantItemRule.findMany.mockResolvedValue([
        { id: 'r1', itemKey: 'LAMP', label: 'لامپ', categoryId: 'cat1', keywords: null, minQuantity: 1, maxQuantity: null, priorityBrandIds: null, allowedProductIdsJson: null },
      ]);
      products.list.mockResolvedValue({
        items: [
          hydratedProduct({ id: 'cheap', name: 'ارزان', slug: 'a', basePrice: 50_000 as any, totalStock: 100 }),
          hydratedProduct({ id: 'expensive', name: 'گران', slug: 'b', basePrice: 200_000 as any, totalStock: 100 }),
        ],
        total: 2,
      });

      const result = await service.generatePackages('c1');

      for (const tier of ['ECONOMIC', 'STANDARD', 'PROFESSIONAL'] as const) {
        const line = result.packages[tier]?.lines.find((l) => l.itemKey === 'LAMP');
        expect(line?.productId).toBe('cheap');
      }
    });
  });

  describe('addToCart — real Backend re-validation, never a client-trusted price/stock/quantity (§7)', () => {
    const readyWithPackage = readyConsultation({
      status: 'READY',
      packagesJson: {
        ECONOMIC: {
          lines: [{ itemKey: 'LAMP', label: 'لامپ', productId: 'lamp1', productName: 'لامپ', slug: 'lamp', brandName: null, variantId: 'v1', quantity: 10, unitPrice: 100000, lineTotal: 1000000, reason: 'x', requestedQuantity: 10 }],
          total: 1000000,
        },
      },
    });

    it('rejects a different user from adding another user\'s consultation to their own cart', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue({ ...readyWithPackage, userId: 'owner' });
      await expect(service.addToCart('c1', { tier: 'ECONOMIC' }, 'attacker')).rejects.toThrow(ForbiddenException);
      expect(cart.addItem).not.toHaveBeenCalled();
    });

    it('refuses to add to cart before a real package has been generated', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(readyConsultation({ status: 'COLLECTING_INFO' }));
      await expect(service.addToCart('c1', { tier: 'ECONOMIC' }, 'u1')).rejects.toThrow(BadRequestException);
    });

    it('re-validates real current stock before adding — reduces quantity rather than trusting the generation-time snapshot', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(readyWithPackage);
      products.getManyByIds.mockResolvedValue([hydratedProduct({ id: 'lamp1', totalStock: 3 })]); // stock dropped since generation
      prisma.electricalConsultation.update.mockResolvedValue({ ...readyWithPackage, status: 'CART_ADDED' });

      const result = await service.addToCart('c1', { tier: 'ECONOMIC' }, 'u1');

      expect(cart.addItem).toHaveBeenCalledWith('u1', expect.objectContaining({ productId: 'lamp1', quantity: 3, source: 'consultant' }));
      expect(result.adjusted).toEqual([{ itemKey: 'LAMP', requested: 10, added: 3 }]);
    });

    it('skips a line entirely — never adds it — when the real current stock is now zero', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue(readyWithPackage);
      products.getManyByIds.mockResolvedValue([hydratedProduct({ id: 'lamp1', totalStock: 0 })]);
      prisma.electricalConsultation.update.mockResolvedValue({ ...readyWithPackage, status: 'CART_ADDED' });

      const result = await service.addToCart('c1', { tier: 'ECONOMIC' }, 'u1');

      expect(cart.addItem).not.toHaveBeenCalled();
      expect(result.skipped).toEqual(['LAMP']);
    });

    it('claims a guest-started consultation for the now-authenticated user on add-to-cart', async () => {
      prisma.electricalConsultation.findUnique.mockResolvedValue({ ...readyWithPackage, userId: null });
      products.getManyByIds.mockResolvedValue([hydratedProduct({ id: 'lamp1', totalStock: 10 })]);
      prisma.electricalConsultation.update.mockResolvedValue({ ...readyWithPackage, userId: 'u1', status: 'CART_ADDED' });

      await service.addToCart('c1', { tier: 'ECONOMIC' }, 'u1');

      expect(prisma.electricalConsultation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', status: 'CART_ADDED' }) }),
      );
    });
  });
});
