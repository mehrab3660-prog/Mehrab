import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDiscountCodeDto } from './dto/discount-code.dto';
import { UpsertPriceTierDto } from './dto/price-tier.dto';
import { CreateCustomerGroupDto } from './dto/customer-group.dto';

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  // ── Customer groups ──
  listCustomerGroups() {
    return this.prisma.customerGroup.findMany({ orderBy: { name: 'asc' } });
  }

  createCustomerGroup(dto: CreateCustomerGroupDto) {
    return this.prisma.customerGroup.create({ data: dto });
  }

  // ── Price tiers (B2B wholesale pricing) ──
  listPriceTiers(productId: string) {
    return this.prisma.priceTier.findMany({ where: { productId }, include: { customerGroup: true } });
  }

  upsertPriceTier(dto: UpsertPriceTierDto) {
    return this.prisma.priceTier.upsert({
      where: {
        productId_customerGroupId_minQuantity: {
          productId: dto.productId,
          customerGroupId: dto.customerGroupId,
          minQuantity: dto.minQuantity,
        },
      },
      create: dto,
      update: { unitPrice: dto.unitPrice },
    });
  }

  removePriceTier(id: string) {
    return this.prisma.priceTier.delete({ where: { id } });
  }

  // ── Discount codes ──
  listDiscountCodes() {
    return this.prisma.discountCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  createDiscountCode(dto: CreateDiscountCodeDto) {
    return this.prisma.discountCode.create({
      data: {
        code: dto.code.toUpperCase(),
        type: dto.type,
        value: dto.value,
        minOrderTotal: dto.minOrderTotal,
        maxUsage: dto.maxUsage,
        maxUsagePerUser: dto.maxUsagePerUser,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async deactivateDiscountCode(id: string) {
    return this.prisma.discountCode.update({ where: { id }, data: { isActive: false } });
  }

  // Validates a code against order total & usage limits; returns the discount amount.
  async evaluateDiscountCode(code: string, userId: string, subtotal: number) {
    const discount = await this.prisma.discountCode.findUnique({ where: { code: code.toUpperCase() } });
    if (!discount || !discount.isActive) throw new NotFoundException('کد تخفیف معتبر نیست');

    const now = new Date();
    if (discount.startsAt && discount.startsAt > now) throw new BadRequestException('کد تخفیف هنوز فعال نشده است');
    if (discount.expiresAt && discount.expiresAt < now) throw new BadRequestException('کد تخفیف منقضی شده است');
    if (discount.minOrderTotal && subtotal < Number(discount.minOrderTotal)) {
      throw new BadRequestException('مبلغ سفارش برای استفاده از این کد کافی نیست');
    }
    if (discount.maxUsage && discount.usedCount >= discount.maxUsage) {
      throw new BadRequestException('ظرفیت استفاده از این کد تخفیف تمام شده است');
    }
    if (discount.maxUsagePerUser) {
      const userUsage = await this.prisma.order.count({ where: { discountCodeId: discount.id, userId } });
      if (userUsage >= discount.maxUsagePerUser) {
        throw new BadRequestException('شما قبلاً از این کد تخفیف استفاده کرده‌اید');
      }
    }

    const amount = discount.type === 'PERCENTAGE' ? (subtotal * Number(discount.value)) / 100 : Number(discount.value);

    return { discount, amount: Math.min(amount, subtotal) };
  }

  // Best code this user could actually apply right now, for a checkout
  // nudge — tries every currently-active code through the same eligibility
  // checks as applying one for real, and keeps the one worth the most.
  async suggestBestDiscountCode(userId: string, subtotal: number) {
    if (subtotal <= 0) return null;

    const now = new Date();
    const candidates = await this.prisma.discountCode.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      },
    });

    let best: { code: string; amount: number } | null = null;
    for (const candidate of candidates) {
      try {
        const { amount } = await this.evaluateDiscountCode(candidate.code, userId, subtotal);
        if (amount > 0 && (!best || amount > best.amount)) best = { code: candidate.code, amount };
      } catch {
        // Not eligible for this one — try the rest.
      }
    }
    return best;
  }
}
