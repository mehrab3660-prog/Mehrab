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
  let service: OrdersService;
  let tx: any;

  beforeEach(() => {
    tx = {
      stock: { findFirst: jest.fn(), update: jest.fn() },
      order: { create: jest.fn() },
      discountCode: { update: jest.fn() },
      cartItem: { deleteMany: jest.fn() },
    };
    prisma = {
      user: { findUniqueOrThrow: jest.fn() },
      cart: { findFirst: jest.fn() },
      address: { findFirst: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    productsService = { resolveUnitPrice: jest.fn() };
    pricingService = { evaluateDiscountCode: jest.fn() };
    invoiceService = {};
    auditLog = {};
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };

    service = new OrdersService(prisma, productsService, pricingService, invoiceService, auditLog, notifications);

    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', customerGroupId: null });
    prisma.address.findFirst.mockResolvedValue({ id: 'addr1' });
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
    tx.stock.findFirst.mockResolvedValue(null); // no warehouse has enough stock

    await expect(service.createFromCart('u1', { addressId: 'addr1' } as any)).rejects.toThrow(/موجودی کافی/);
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('computes subtotal/shipping/grandTotal correctly with no discount', async () => {
    prisma.cart.findFirst.mockResolvedValue(buildCart());
    productsService.resolveUnitPrice.mockResolvedValue(150_000);
    tx.stock.findFirst.mockResolvedValue({ id: 'stock1' });
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
    tx.stock.findFirst.mockResolvedValue({ id: 'stock1' });
    tx.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'SN-TEST', items: [] });
    pricingService.evaluateDiscountCode.mockResolvedValue({ discount: { id: 'disc1' }, amount: 50_000 });

    await service.createFromCart('u1', { addressId: 'addr1', discountCode: 'OFF50' } as any);

    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.discountTotal).toBe(50_000);
    expect(data.grandTotal).toBe(300_000 - 50_000 + 50_000); // subtotal - discount + shipping
    expect(tx.discountCode.update).toHaveBeenCalledWith({ where: { id: 'disc1' }, data: { usedCount: { increment: 1 } } });
  });

  it('never lets the grand total go negative even if a discount exceeds subtotal+shipping', async () => {
    prisma.cart.findFirst.mockResolvedValue(buildCart());
    productsService.resolveUnitPrice.mockResolvedValue(1_000);
    tx.stock.findFirst.mockResolvedValue({ id: 'stock1' });
    tx.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'SN-TEST', items: [] });
    pricingService.evaluateDiscountCode.mockResolvedValue({ discount: { id: 'disc1' }, amount: 999_999 });

    await service.createFromCart('u1', { addressId: 'addr1', discountCode: 'HUGE' } as any);

    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.grandTotal).toBe(0);
  });
});
