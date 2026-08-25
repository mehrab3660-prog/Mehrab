import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  LOYALTY_EARN_DIVISOR_TOMAN,
  LOYALTY_MAX_REDEMPTION_RATIO,
  LOYALTY_POINT_VALUE_TOMAN,
  REFERRAL_BONUS_POINTS,
} from './loyalty.constants';

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  async getSummary(userId: string) {
    const [user, transactions, referralCount, referralRewardedCount] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { loyaltyPoints: true, referralCode: true } }),
      this.prisma.loyaltyTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, type: true, points: true, balanceAfter: true, note: true, orderId: true, createdAt: true },
      }),
      this.prisma.user.count({ where: { referredByUserId: userId } }),
      this.prisma.user.count({ where: { referredByUserId: userId, referralRewardedAt: { not: null } } }),
    ]);

    return {
      balance: user.loyaltyPoints,
      pointValueToman: LOYALTY_POINT_VALUE_TOMAN,
      earnDivisorToman: LOYALTY_EARN_DIVISOR_TOMAN,
      maxRedemptionRatio: LOYALTY_MAX_REDEMPTION_RATIO,
      transactions,
      referralCode: user.referralCode,
      referralBonusPoints: REFERRAL_BONUS_POINTS,
      referralCount,
      referralRewardedCount,
    };
  }
}
