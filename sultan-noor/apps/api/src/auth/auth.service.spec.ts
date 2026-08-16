import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let prisma: any;
  let jwt: any;
  let sms: any;
  let activity: any;
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      otpCode: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      discountCode: { upsert: jest.fn().mockResolvedValue({}) },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-token'), verify: jest.fn() };
    sms = { sendOtp: jest.fn().mockResolvedValue(undefined), sendText: jest.fn().mockResolvedValue(undefined) };
    activity = { record: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(prisma, jwt, sms, activity);
  });

  describe('requestOtp', () => {
    it('stores a hashed OTP and sends it via SMS', async () => {
      prisma.otpCode.create.mockResolvedValue({});

      const result = await service.requestOtp({ phone: '09120000001', purpose: 'LOGIN' } as any);

      expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
      const created = prisma.otpCode.create.mock.calls[0][0].data;
      expect(created.phone).toBe('09120000001');
      expect(created.codeHash).not.toMatch(/^\d{5}$/); // never stores the raw code
      expect(sms.sendOtp).toHaveBeenCalledWith('09120000001', expect.stringMatching(/^\d{5}$/));
      expect(result.expiresInSeconds).toBe(300);
    });

    it('surfaces a ServiceUnavailableException when the SMS provider fails, instead of silently claiming success', async () => {
      prisma.otpCode.create.mockResolvedValue({});
      sms.sendOtp.mockRejectedValue(new Error('provider down'));

      await expect(service.requestOtp({ phone: '09120000001', purpose: 'LOGIN' } as any)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('rejects a resend within the cooldown window without sending another SMS', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({ createdAt: new Date() });

      await expect(service.requestOtp({ phone: '09120000001', purpose: 'LOGIN' } as any)).rejects.toMatchObject({
        status: 429,
      });
      expect(sms.sendOtp).not.toHaveBeenCalled();
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });

    it('allows a resend once the cooldown window has passed', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 121_000) });
      prisma.otpCode.create.mockResolvedValue({});

      await expect(service.requestOtp({ phone: '09120000001', purpose: 'LOGIN' } as any)).resolves.toBeDefined();
      expect(sms.sendOtp).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyOtp', () => {
    const baseDto = { phone: '09120000001', code: '12345', purpose: 'LOGIN' } as any;

    it('rejects when no OTP row exists for the phone/purpose', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);
      await expect(service.verifyOtp(baseDto)).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired OTP', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp1',
        codeHash: await bcrypt.hash('12345', 10),
        expiresAt: new Date(Date.now() - 1000),
        attempts: 0,
      });
      await expect(service.verifyOtp(baseDto)).rejects.toThrow('کد تایید منقضی شده است');
    });

    it('rejects once the max attempt count is reached, even with the correct code', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp1',
        codeHash: await bcrypt.hash('12345', 10),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 5,
      });
      await expect(service.verifyOtp(baseDto)).rejects.toThrow('تعداد تلاش‌های مجاز به پایان رسیده است');
    });

    it('increments attempts and rejects on a wrong code, without consuming the OTP', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp1',
        codeHash: await bcrypt.hash('12345', 10),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 1,
      });

      await expect(service.verifyOtp({ ...baseDto, code: '00000' })).rejects.toThrow('کد تایید نادرست است');
      expect(prisma.otpCode.update).toHaveBeenCalledWith({ where: { id: 'otp1' }, data: { attempts: { increment: 1 } } });
    });

    it('on a correct code: consumes the OTP, creates a new user, and issues tokens', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp1',
        codeHash: await bcrypt.hash('12345', 10),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user1',
        phone: '09120000001',
        role: 'CUSTOMER',
        customerType: 'RETAIL',
      });

      const result = await service.verifyOtp(baseDto);
      // Flush the fire-and-forget welcome-discount send (it awaits the
      // discount-code upsert before texting, so needs more than one tick).
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(prisma.otpCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'otp1' }, data: expect.objectContaining({ consumedAt: expect.any(Date) }) }),
      );
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toBe('signed-token');
      expect(result.user).toMatchObject({ sub: 'user1', phone: '09120000001' });

      // First-purchase welcome discount: only for genuinely new users.
      expect(prisma.discountCode.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'WELCOME10' } }),
      );
      expect(sms.sendText).toHaveBeenCalledWith('09120000001', expect.stringContaining('WELCOME10'));
    });

    it('does not re-create or re-verify an already-verified existing user', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp1',
        codeHash: await bcrypt.hash('12345', 10),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user1',
        phone: '09120000001',
        role: 'CUSTOMER',
        customerType: 'RETAIL',
        isPhoneVerified: true,
      });

      await service.verifyOtp(baseDto);
      await Promise.resolve();

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(sms.sendText).not.toHaveBeenCalled();
    });
  });
});
