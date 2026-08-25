import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShippingRateDto, UpdateShippingRateDto } from './dto/shipping-rate.dto';

// No product weight recorded yet (legacy/un-weighed variants) — assume an
// average parcel rather than letting an unweighted item default to 0g and
// always win the lightest rate band.
const DEFAULT_ITEM_WEIGHT_GRAMS = 1000;

const FLAT_RATE_FALLBACK = 50000; // تومان — وقتی هیچ نرخ ارسالی تعریف نشده باشد

interface ShippableItem {
  quantity: number;
  productVariant?: { weightGrams?: number | null } | null;
}

@Injectable()
export class ShippingService {
  constructor(private prisma: PrismaService) {}

  async resolveShippingCost(items: ShippableItem[], province: string): Promise<number> {
    const totalWeightGrams = items.reduce(
      (sum, item) => sum + (item.productVariant?.weightGrams ?? DEFAULT_ITEM_WEIGHT_GRAMS) * item.quantity,
      0,
    );

    const rates = await this.prisma.shippingRate.findMany({ orderBy: { maxWeightGrams: 'asc' } });
    if (rates.length === 0) return FLAT_RATE_FALLBACK;

    const provinceMatch = rates.find((r) => r.province === province && r.maxWeightGrams >= totalWeightGrams);
    if (provinceMatch) return Number(provinceMatch.price);

    const fallbackMatch = rates.find((r) => r.province === null && r.maxWeightGrams >= totalWeightGrams);
    if (fallbackMatch) return Number(fallbackMatch.price);

    // Heavier than every configured band: use the costliest band we have
    // rather than silently under-charging shipping.
    const provinceRates = rates.filter((r) => r.province === province);
    const nullRates = rates.filter((r) => r.province === null);
    const heaviest = (provinceRates.length > 0 ? provinceRates : nullRates.length > 0 ? nullRates : rates).at(-1);
    return heaviest ? Number(heaviest.price) : FLAT_RATE_FALLBACK;
  }

  list() {
    return this.prisma.shippingRate.findMany({ orderBy: [{ province: 'asc' }, { maxWeightGrams: 'asc' }] });
  }

  create(dto: CreateShippingRateDto) {
    return this.prisma.shippingRate.create({
      data: { province: dto.province, maxWeightGrams: dto.maxWeightGrams, price: dto.price },
    });
  }

  async update(id: string, dto: UpdateShippingRateDto) {
    const rate = await this.prisma.shippingRate.findUnique({ where: { id } });
    if (!rate) throw new NotFoundException('نرخ ارسال یافت نشد');
    return this.prisma.shippingRate.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const rate = await this.prisma.shippingRate.findUnique({ where: { id } });
    if (!rate) throw new NotFoundException('نرخ ارسال یافت نشد');
    await this.prisma.shippingRate.delete({ where: { id } });
  }
}
