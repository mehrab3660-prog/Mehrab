import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PricingService } from './pricing.service';

describe('PricingService.evaluateDiscountCode', () => {
  let prisma: any;
  let service: PricingService;

  beforeEach(() => {
    prisma = {
      discountCode: { findUnique: jest.fn() },
      order: { count: jest.fn() },
    };
    service = new PricingService(prisma);
  });

  it('rejects an unknown code', async () => {
    prisma.discountCode.findUnique.mockResolvedValue(null);
    await expect(service.evaluateDiscountCode('NOPE', 'u1', 100_000)).rejects.toThrow(NotFoundException);
  });

  it('rejects a deactivated code', async () => {
    prisma.discountCode.findUnique.mockResolvedValue({ isActive: false });
    await expect(service.evaluateDiscountCode('OFF', 'u1', 100_000)).rejects.toThrow(NotFoundException);
  });

  it('rejects a code that has not started yet', async () => {
    prisma.discountCode.findUnique.mockResolvedValue({
      isActive: true,
      startsAt: new Date(Date.now() + 86_400_000),
      expiresAt: null,
    });
    await expect(service.evaluateDiscountCode('FUTURE', 'u1', 100_000)).rejects.toThrow('کد تخفیف هنوز فعال نشده است');
  });

  it('rejects an expired code', async () => {
    prisma.discountCode.findUnique.mockResolvedValue({
      isActive: true,
      startsAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.evaluateDiscountCode('OLD', 'u1', 100_000)).rejects.toThrow('کد تخفیف منقضی شده است');
  });

  it('rejects when the order subtotal is below minOrderTotal', async () => {
    prisma.discountCode.findUnique.mockResolvedValue({
      isActive: true,
      startsAt: null,
      expiresAt: null,
      minOrderTotal: 200_000,
    });
    await expect(service.evaluateDiscountCode('MIN200', 'u1', 100_000)).rejects.toThrow(BadRequestException);
  });

  it('rejects once global maxUsage is exhausted', async () => {
    prisma.discountCode.findUnique.mockResolvedValue({
      isActive: true,
      startsAt: null,
      expiresAt: null,
      minOrderTotal: null,
      maxUsage: 10,
      usedCount: 10,
    });
    await expect(service.evaluateDiscountCode('CAP', 'u1', 100_000)).rejects.toThrow('ظرفیت استفاده از این کد تخفیف تمام شده است');
  });

  it('rejects when the user already used the code up to their per-user cap', async () => {
    prisma.discountCode.findUnique.mockResolvedValue({
      id: 'd1',
      isActive: true,
      startsAt: null,
      expiresAt: null,
      minOrderTotal: null,
      maxUsage: null,
      maxUsagePerUser: 1,
    });
    prisma.order.count.mockResolvedValue(1);
    await expect(service.evaluateDiscountCode('ONCE', 'u1', 100_000)).rejects.toThrow('شما قبلاً از این کد تخفیف استفاده کرده‌اید');
  });

  it('computes a percentage discount correctly', async () => {
    prisma.discountCode.findUnique.mockResolvedValue({
      id: 'd1',
      isActive: true,
      startsAt: null,
      expiresAt: null,
      minOrderTotal: null,
      maxUsage: null,
      maxUsagePerUser: null,
      type: 'PERCENTAGE',
      value: 10,
    });

    const { amount } = await service.evaluateDiscountCode('TEN', 'u1', 200_000);
    expect(amount).toBe(20_000);
  });

  it('computes a fixed-amount discount and clamps it to the subtotal', async () => {
    prisma.discountCode.findUnique.mockResolvedValue({
      id: 'd1',
      isActive: true,
      startsAt: null,
      expiresAt: null,
      minOrderTotal: null,
      maxUsage: null,
      maxUsagePerUser: null,
      type: 'FIXED_AMOUNT',
      value: 500_000,
    });

    // subtotal (100,000) is smaller than the fixed discount (500,000) —
    // a customer must never be charged a negative amount.
    const { amount } = await service.evaluateDiscountCode('BIG', 'u1', 100_000);
    expect(amount).toBe(100_000);
  });
});
