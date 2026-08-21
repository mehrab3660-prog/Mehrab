import { BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';

describe('CartService.addItem', () => {
  let prisma: any;
  let productsService: any;
  let pricingService: any;
  let activityLog: any;
  let service: CartService;

  beforeEach(() => {
    prisma = {
      cart: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      cartItem: { upsert: jest.fn().mockResolvedValue({}) },
      productVariant: { findMany: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    productsService = { resolveUnitPrice: jest.fn().mockResolvedValue(0) };
    pricingService = {};
    activityLog = { record: jest.fn().mockResolvedValue(undefined) };
    service = new CartService(prisma, productsService, pricingService, activityLog);

    prisma.cart.findFirst.mockResolvedValue({ id: 'cart1', items: [] });
  });

  it('resolves the variant server-side — a client can never force which variant/stock line gets credited', async () => {
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1' }]);

    await service.addItem('u1', { productId: 'p1', quantity: 1 } as any);

    expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ productVariantId: 'v1' }) }),
    );
  });

  it('refuses to guess a variant when a product has more than one — never silently picks one', async () => {
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }]);

    await expect(service.addItem('u1', { productId: 'p1', quantity: 1 } as any)).rejects.toThrow(BadRequestException);
  });

  it('never records a store_ai.add_to_cart event for an ordinary (non-AI) add to cart', async () => {
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1' }]);

    await service.addItem('u1', { productId: 'p1', quantity: 1 } as any);

    expect(activityLog.record).not.toHaveBeenCalled();
  });

  it('records a real store_ai.add_to_cart event, tied to the real product id, only when the click genuinely came from the AI chat', async () => {
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1' }]);

    await service.addItem('u1', { productId: 'p1', quantity: 1, source: 'ai_advisor' } as any);

    expect(activityLog.record).toHaveBeenCalledWith({ userId: 'u1', event: 'store_ai.add_to_cart', metadata: { productId: 'p1' } });
  });

  it('records a real consultant.add_to_cart event, tied to the real product id, only when the click genuinely came from the Smart Electrical Consultant', async () => {
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1' }]);

    await service.addItem('u1', { productId: 'p1', quantity: 1, source: 'consultant' } as any);

    expect(activityLog.record).toHaveBeenCalledWith({ userId: 'u1', event: 'consultant.add_to_cart', metadata: { productId: 'p1' } });
  });

  it('ignores an unrecognized source value rather than crashing (DTO whitelist already rejects it at the HTTP boundary)', async () => {
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1' }]);

    await service.addItem('u1', { productId: 'p1', quantity: 1, source: 'something_else' } as any);

    expect(activityLog.record).not.toHaveBeenCalled();
  });
});
