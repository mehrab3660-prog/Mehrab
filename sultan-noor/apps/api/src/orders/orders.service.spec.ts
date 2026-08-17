import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';

function buildCart(overrides: Partial<{ productVariantId: string | null }> = {}) {
  return {
    id: 'cart1',
    items: [
      {
        productId: 'p1',
        productVariantId: overrides.productVariantId ?? 'v1',
        quantity: 2,
        product: { name: 'لامپ LED' },
        productVariant: { sku: 'LED-1' },
      },
    ],
  };
}

describe('OrdersService.createFromCart', () => {
  let prisma: any;
  let productsService: any;
  let pricingService: any;
  let invoiceService: any;
  let auditLog: any;
  let notifications: any;
  let shippingService: any;
  let service: OrdersService;
  let tx: any;

  beforeEach(() => {
    tx = {
      stock: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({ quantity: 8 }) },
      order: { create: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      discountCode: { update: jest.fn() },
      cartItem: { deleteMany: jest.fn() },
      user: {
        update: jest.fn().mockResolvedValue({ loyaltyPoints: 0 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ loyaltyPoints: 0 }),
      },
      loyaltyTransaction: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: { findUniqueOrThrow: jest.fn() },
      cart: { findFirst: jest.fn() },
      address: { findFirst: jest.fn() },
      order: { findUnique: jest.fn(), update: jest.fn() },
      payment: { updateMany: jest.fn().mockResolvedValue(undefined) },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    productsService = { resolveUnitPrice: jest.fn() };
    pricingService = { evaluateDiscountCode: jest.fn() };
    invoiceService = { generateForOrder: jest.fn().mockResolvedValue(undefined) };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    shippingService = { resolveShippingCost: jest.fn().mockResolvedValue(50000) };
    const smsProvider = { sendText: jest.fn().mockResolvedValue(undefined) };

    service = new OrdersService(
      prisma,
      productsService,
      pricingService,
      invoiceService,
      auditLog,
      notifications,
      shippingService,
      smsProvider as any,
    );

    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', customerGroupId: null, loyaltyPoints: 0 });
    prisma.address.findFirst.mockResolvedValue({ id: 'addr1', province: 'تهران' });
  });

  it('rejects when the cart is empty', async () => {
    prisma.cart.findFirst.mockResolvedValue({ id: 'cart1', items: [] });
    await expect(service.createFromCart('u1', { addressId: 'addr1' } as any)).rejects.toThrow(BadRequestException);
  });

  it('rejects when the address does not belong to the user', async () => {
    prisma.cart.findFirst.mockResolvedValue(buildCart());
    prisma.address.findFirst.mockResolvedValue(null);
    await expect(service.createFromCart('u1', { addressId: 'other-users-addr' } as any)).rejects.toThrow(NotFoundException);
  });

  it('rejects the whole order when a line item has insufficient stock (transactional)', async () => {
    prisma.cart.findFirst.mockResolvedValue(buildCart());
    productsService.resolveUnitPrice.mockResolvedValue(150_000);
    tx.stock.findMany.mockResolvedValue([]); // no warehouse has enough stock

    await expect(service.createFromCart('u1', { addressId: 'addr1' } as any)).rejects.toThrow(/موجودی کافی/);
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('computes subtotal/shipping/grandTotal correctly with no discount', async () => {
    prisma.cart.findFirst.mockResolvedValue(buildCart());
    productsService.resolveUnitPrice.mockResolvedValue(150_000);
    tx.stock.findMany.mockResolvedValue([{ id: 'stock1', warehouseId: 'w1', productVariantId: 'v1', quantity: 10 }]);
    tx.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'SN-TEST', items: [] });

    await service.createFromCart('u1', { addressId: 'addr1' } as any);

    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.subtotal).toBe(300_000); // 150,000 × 2
    expect(data.discountTotal).toBe(0);
    expect(data.shippingTotal).toBe(50_000);
    expect(data.grandTotal).toBe(350_000);
    expect(tx.stock.update).toHaveBeenCalledWith({ where: { id: 'stock1' }, data: { quantity: { decrement: 2 } } });
    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart1' } });
  });

  it('applies a discount code to the grand total and records its usage', async () => {
    prisma.cart.findFirst.mockResolvedValue(buildCart());
    productsService.resolveUnitPrice.mockResolvedValue(150_000);
    tx.stock.findMany.mockResolvedValue([{ id: 'stock1', warehouseId: 'w1', productVariantId: 'v1', quantity: 10 }]);
    tx.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'SN-TEST', items: [] });
    pricingService.evaluateDiscountCode.mockResolvedValue({ discount: { id: 'disc1' }, amount: 50_000 });

    await service.createFromCart('u1', { addressId: 'addr1', discountCode: 'OFF50' } as any);

    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.discountTotal).toBe(50_000);
    expect(data.grandTotal).toBe(300_000 - 50_000 + 50_000); // subtotal - discount + shipping
    expect(tx.discountCode.update).toHaveBeenCalledWith({ where: { id: 'disc1' }, data: { usedCount: { increment: 1 } } });
  });

  it('prefers a single warehouse that can fulfill the whole order over splitting across warehouses', async () => {
    prisma.cart.findFirst.mockResolvedValue(buildCart());
    productsService.resolveUnitPrice.mockResolvedValue(150_000);
    // w1 alone covers the needed quantity (2); w2 has less than needed.
    tx.stock.findMany.mockResolvedValue([
      { id: 'stock-w1', warehouseId: 'w1', productVariantId: 'v1', quantity: 10 },
      { id: 'stock-w2', warehouseId: 'w2', productVariantId: 'v1', quantity: 1 },
    ]);
    tx.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'SN-TEST', items: [] });

    await service.createFromCart('u1', { addressId: 'addr1' } as any);

    expect(tx.stock.update).toHaveBeenCalledWith({ where: { id: 'stock-w1' }, data: { quantity: { decrement: 2 } } });
    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.items.create[0].fulfillmentWarehouseId).toBe('w1');
  });

  it('rejects redeeming more loyalty points than the user has', async () => {
    prisma.cart.findFirst.mockResolvedValue(buildCart());
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', customerGroupId: null, loyaltyPoints: 5 });
    productsService.resolveUnitPrice.mockResolvedValue(150_000);
    tx.stock.findMany.mockResolvedValue([{ id: 'stock1', warehouseId: 'w1', productVariantId: 'v1', quantity: 10 }]);

    await expect(
      service.createFromCart('u1', { addressId: 'addr1', redeemLoyaltyPoints: 10 } as any),
    ).rejects.toThrow(/بیشتر از موجودی/);
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('rejects a loyalty redemption worth more than half the subtotal', async () => {
    prisma.cart.findFirst.mockResolvedValue(buildCart());
    // subtotal = 300,000; 500 points × 1,000 toman = 500,000, which is over half.
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', customerGroupId: null, loyaltyPoints: 500 });
    productsService.resolveUnitPrice.mockResolvedValue(150_000);
    tx.stock.findMany.mockResolvedValue([{ id: 'stock1', warehouseId: 'w1', productVariantId: 'v1', quantity: 10 }]);

    await expect(
      service.createFromCart('u1', { addressId: 'addr1', redeemLoyaltyPoints: 500 } as any),
    ).rejects.toThrow(/نیمی از مبلغ/);
  });

  it('applies a loyalty point redemption to the grand total and debits the balance', async () => {
    prisma.cart.findFirst.mockResolvedValue(buildCart());
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', customerGroupId: null, loyaltyPoints: 100 });
    productsService.resolveUnitPrice.mockResolvedValue(150_000);
    tx.stock.findMany.mockResolvedValue([{ id: 'stock1', warehouseId: 'w1', productVariantId: 'v1', quantity: 10 }]);
    tx.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'SN-TEST', items: [] });
    tx.user.update.mockResolvedValue({ loyaltyPoints: 90 });

    // subtotal = 300,000; 10 points × 1,000 toman = 10,000 discount (well under the 50% cap).
    await service.createFromCart('u1', { addressId: 'addr1', redeemLoyaltyPoints: 10 } as any);

    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.loyaltyPointsRedeemed).toBe(10);
    expect(data.loyaltyDiscount).toBe(10_000);
    expect(data.grandTotal).toBe(300_000 - 10_000 + 50_000);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { loyaltyPoints: { decrement: 10 } } });
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        orderId: 'order1',
        type: 'REDEEMED',
        points: -10,
        balanceAfter: 90,
        note: 'استفاده در سفارش SN-TEST',
      },
    });
  });

  it('never lets the grand total go negative even if a discount exceeds subtotal+shipping', async () => {
    prisma.cart.findFirst.mockResolvedValue(buildCart());
    productsService.resolveUnitPrice.mockResolvedValue(1_000);
    tx.stock.findMany.mockResolvedValue([{ id: 'stock1', warehouseId: 'w1', productVariantId: 'v1', quantity: 10 }]);
    tx.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'SN-TEST', items: [] });
    pricingService.evaluateDiscountCode.mockResolvedValue({ discount: { id: 'disc1' }, amount: 999_999 });

    await service.createFromCart('u1', { addressId: 'addr1', discountCode: 'HUGE' } as any);

    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.grandTotal).toBe(0);
  });
});

describe('OrdersService.updateStatus — loyalty point effects', () => {
  let prisma: any;
  let auditLog: any;
  let notifications: any;
  let invoiceService: any;
  let service: OrdersService;
  let tx: any;

  function buildOrder(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'order1',
      userId: 'u1',
      orderNumber: 'SN-TEST',
      status: 'SHIPPED',
      subtotal: 300_000,
      discountTotal: 0,
      loyaltyDiscount: 0,
      loyaltyPointsRedeemed: 0,
      loyaltyPointsEarned: 0,
      loyaltyPointsAwardedAt: null,
      loyaltyPointsReversedAt: null,
      user: { phone: '09120000000' },
      ...overrides,
    };
  }

  beforeEach(() => {
    tx = {
      user: {
        update: jest.fn().mockResolvedValue({ loyaltyPoints: 0 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ loyaltyPoints: 0 }),
      },
      loyaltyTransaction: { create: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      order: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      payment: { updateMany: jest.fn().mockResolvedValue(undefined) },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    invoiceService = { generateForOrder: jest.fn().mockResolvedValue(undefined) };
    const smsProvider = { sendText: jest.fn().mockResolvedValue(undefined) };

    service = new OrdersService(
      prisma,
      {} as any,
      {} as any,
      invoiceService,
      auditLog,
      notifications,
      {} as any,
      smsProvider as any,
    );
  });

  it('awards points once an order reaches DELIVERED, based on subtotal minus discounts', async () => {
    prisma.order.findUnique.mockResolvedValue(buildOrder({ subtotal: 350_000, discountTotal: 30_000 }));
    tx.user.update.mockResolvedValue({ loyaltyPoints: 16 });

    // (350,000 - 30,000) / 20,000 = 16 points earned.
    await service.updateStatus('admin1', 'order1', { status: 'DELIVERED' } as any);

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { loyaltyPoints: { increment: 16 } } });
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        orderId: 'order1',
        type: 'EARNED',
        points: 16,
        balanceAfter: 16,
        note: 'خرید سفارش SN-TEST',
      },
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order1' },
      data: { loyaltyPointsEarned: 16, loyaltyPointsAwardedAt: expect.any(Date) },
    });
  });

  it('does not re-award points on an order that already has loyaltyPointsAwardedAt set', async () => {
    prisma.order.findUnique.mockResolvedValue(buildOrder({ loyaltyPointsAwardedAt: new Date() }));

    await service.updateStatus('admin1', 'order1', { status: 'DELIVERED' } as any);

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled();
  });

  it('refunds redeemed points when a never-delivered order is cancelled', async () => {
    prisma.order.findUnique.mockResolvedValue(buildOrder({ status: 'PENDING_PAYMENT', loyaltyPointsRedeemed: 10 }));
    tx.user.findUniqueOrThrow.mockResolvedValue({ loyaltyPoints: 5 });

    await service.updateStatus('admin1', 'order1', { status: 'CANCELLED' } as any);

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { loyaltyPoints: 15 } });
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        orderId: 'order1',
        type: 'ADJUSTED',
        points: 10,
        balanceAfter: 15,
        note: 'لغو/بازگشت سفارش SN-TEST',
      },
    });
  });

  it('claws back earned points and refunds redeemed points when a delivered order is refunded, never going below zero', async () => {
    prisma.order.findUnique.mockResolvedValue(
      buildOrder({ status: 'DELIVERED', loyaltyPointsRedeemed: 5, loyaltyPointsEarned: 20, loyaltyPointsAwardedAt: new Date() }),
    );
    // Customer only has 3 points left (spent the rest elsewhere) — clawing
    // back 20 while refunding 5 (net -15) must clamp at 0, not go negative.
    tx.user.findUniqueOrThrow.mockResolvedValue({ loyaltyPoints: 3 });

    await service.updateStatus('admin1', 'order1', { status: 'REFUNDED' } as any);

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { loyaltyPoints: 0 } });
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        orderId: 'order1',
        type: 'ADJUSTED',
        points: -3,
        balanceAfter: 0,
        note: 'لغو/بازگشت سفارش SN-TEST',
      },
    });
  });

  it('does not reverse twice on an order that already has loyaltyPointsReversedAt set', async () => {
    prisma.order.findUnique.mockResolvedValue(
      buildOrder({ status: 'DELIVERED', loyaltyPointsRedeemed: 5, loyaltyPointsReversedAt: new Date() }),
    );

    await service.updateStatus('admin1', 'order1', { status: 'REFUNDED' } as any);

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled();
  });
});
