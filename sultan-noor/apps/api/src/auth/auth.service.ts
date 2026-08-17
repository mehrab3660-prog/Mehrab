import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomInt, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SmsProvider } from './sms.provider';
import { ActivityLogService } from '../activity/activity-log.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
// Server-side floor on how often a real SMS can be sent to the same phone —
// independent of the frontend's resend timer, which resets on page refresh
// and would otherwise let someone burn SMS credit by just reloading.
const OTP_RESEND_COOLDOWN_SECONDS = 120;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private sms: SmsProvider,
    private activity: ActivityLogService,
  ) {}

  async userExists(phone: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
    return !!user;
  }

  async requestOtp(dto: RequestOtpDto) {
    // Only an unconsumed code counts toward the cooldown — once a code has
    // actually been used to log in, there's nothing left to protect against
    // resending, and blocking a fresh request would lock the user out of a
    // quick re-login for no reason.
    const recent = await this.prisma.otpCode.findFirst({
      where: { phone: dto.phone, purpose: dto.purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const secondsSince = (Date.now() - recent.createdAt.getTime()) / 1000;
      if (secondsSince < OTP_RESEND_COOLDOWN_SECONDS) {
        throw new HttpException(
          {
            message: 'کد تایید قبلاً برای این شماره ارسال شده است، کمی صبر کنید',
            retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSince),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

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

    try {
      await this.sms.sendOtp(dto.phone, code);
    } catch (err) {
      // The OTP row above still exists and is verifiable, but the user never
      // received it — fail loudly instead of claiming success.
      this.logger.error(`ارسال پیامک OTP به ${dto.phone} ناموفق بود: ${(err as Error).message}`);
      throw new ServiceUnavailableException('ارسال پیامک تایید ناموفق بود، لطفاً کمی بعد دوباره تلاش کنید');
    }

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
    const isNewUser = !user;
    if (!user) {
      const referralCode = await this.generateReferralCode();
      let referredByUserId: string | undefined;
      if (dto.referralCode) {
        const referrer = await this.prisma.user.findUnique({
          where: { referralCode: dto.referralCode.trim().toUpperCase() },
          select: { id: true },
        });
        if (referrer) referredByUserId = referrer.id;
      }
      user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          fullName: dto.fullName,
          customerType: dto.customerType ?? 'RETAIL',
          companyName: dto.companyName,
          isPhoneVerified: true,
          referralCode,
          referredByUserId,
        },
      });
    } else if (!user.isPhoneVerified) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { isPhoneVerified: true } });
    }

    // Backfills a referral code for accounts created before this feature
    // shipped — every login runs through here, so active users pick one up
    // on their next sign-in without needing a one-off data migration.
    if (!user.referralCode) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { referralCode: await this.generateReferralCode() } });
    }

    await this.activity.record({ userId: user.id, event: 'auth.otp_verified', metadata: { purpose: dto.purpose } });

    if (isNewUser) {
      void this.sendWelcomeDiscount(user.phone).catch((err) =>
        this.logger.error(`ارسال کد تخفیف خوش‌آمدگویی به ${user!.phone} ناموفق بود: ${(err as Error).message}`),
      );
    }

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

  // A single store-wide code, capped at one use per customer via the
  // existing maxUsagePerUser mechanism (see PricingService.evaluateDiscountCode)
  // — that cap is what makes it a "first purchase" offer without needing a
  // dedicated per-user code or a new schema field.
  private async ensureWelcomeDiscountCode() {
    return this.prisma.discountCode.upsert({
      where: { code: 'WELCOME10' },
      create: { code: 'WELCOME10', type: 'PERCENTAGE', value: 10, maxUsagePerUser: 1, isActive: true },
      update: {},
    });
  }

  private async sendWelcomeDiscount(phone: string) {
    await this.ensureWelcomeDiscountCode();
    await this.sms.sendText(phone, 'به سلطان نور خوش آمدید! برای اولین خرید خود با کد WELCOME10 ده درصد تخفیف بگیرید.');
  }

  private async generateReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(3).toString('hex').toUpperCase();
      const exists = await this.prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
      if (!exists) return code;
    }
    throw new Error('تولید کد معرف یکتا ناموفق بود');
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
