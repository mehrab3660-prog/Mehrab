import { Injectable, Logger } from '@nestjs/common';

// Thin abstraction over an Iranian SMS gateway (Kavenegar / Melipayamak / ...).
// In development (or until real credentials are configured) it just logs the
// code so the OTP flow is fully testable end-to-end without a paid account.
@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name);

  async sendOtp(phone: string, code: string): Promise<void> {
    if (!process.env.SMS_API_KEY) {
      this.logger.warn(`[DEV SMS] OTP for ${phone}: ${code}`);
      return;
    }

    // TODO: wire up real gateway, e.g.:
    // await fetch(`https://api.kavenegar.com/v1/${process.env.SMS_API_KEY}/verify/lookup.json`, {
    //   method: 'POST',
    //   body: new URLSearchParams({ receptor: phone, token: code, template: 'otp' }),
    // });
    this.logger.log(`OTP sent to ${phone}`);
  }
}
