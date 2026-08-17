import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LOYALTY_EARN_DIVISOR_TOMAN, LOYALTY_MAX_REDEMPTION_RATIO, LOYALTY_POINT_VALUE_TOMAN } from './loyalty.constants';

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  async getSummary(userId: string) {
    const [user, transactions] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { loyaltyPoints: true } }),
      this.prisma.loyaltyTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, type: true, points: true, balanceAfter: true, note: true, orderId: true, createdAt: true },
      }),
    ]);

    return {
      balance: user.loyaltyPoints,
      pointValueToman: LOYALTY_POINT_VALUE_TOMAN,
      earnDivisorToman: LOYALTY_EARN_DIVISOR_TOMAN,
      maxRedemptionRatio: LOYALTY_MAX_REDEMPTION_RATIO,
      transactions,
    };
  }
}
