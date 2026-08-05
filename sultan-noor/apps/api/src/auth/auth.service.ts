import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { OtpPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsProvider } from './sms.provider';
import { ActivityLogService } from '../activity/activity-log.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private sms: SmsProvider,
    private activity: ActivityLogService,
  ) {}

  async requestOtp(dto: RequestOtpDto) {
    const code = String(randomInt(10000, 99999));
    const codeHash = await bcrypt.hash(code, 10);

    await this.prisma.otpCode.create({
      data: {
        phone: dto.phone,
        codeHash,
        purpose: dto.purpose,
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      },
    });

    await this.sms.sendOtp(dto.phone, code);

    return { message: 'کد تایید ارسال شد', expiresInSeconds: OTP_TTL_MINUTES * 60 };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone: dto.phone, purpose: dto.purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new BadRequestException('کد تایید یافت نشد، دوباره درخواست دهید');
    if (otp.expiresAt < new Date()) throw new BadRequestException('کد تایید منقضی شده است');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new BadRequestException('تعداد تلاش‌های مجاز به پایان رسیده است');

    const isValid = await bcrypt.compare(dto.code, otp.codeHash);
    if (!isValid) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('کد تایید نادرست است');
    }

    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    let user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          fullName: dto.fullName,
          customerType: dto.customerType ?? 'RETAIL',
          companyName: dto.companyName,
          isPhoneVerified: true,
        },
      });
    } else if (!user.isPhoneVerified) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { isPhoneVerified: true } });
    }

    await this.activity.record({ userId: user.id, event: 'auth.otp_verified', metadata: { purpose: dto.purpose } });

    return this.issueTokens(user.id, user.phone, user.role, user.customerType);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new UnauthorizedException();
      return this.issueTokens(user.id, user.phone, user.role, user.customerType);
    } catch {
      throw new UnauthorizedException('رفرش توکن نامعتبر است');
    }
  }

  private issueTokens(userId: string, phone: string, role: string, customerType: string) {
    const payload = { sub: userId, phone, role, customerType };
    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '30d',
    });
    return { accessToken, refreshToken, user: payload };
  }
}
