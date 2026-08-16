import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

// Thin abstraction over an Iranian SMS gateway. Currently implements
// Kavenegar's Verify Lookup API (https://kavenegar.com/rest.html#lookup),
// which requires a pre-approved OTP template in the Kavenegar panel.
// In development (or until an API key/template are set, via either the
// admin dashboard's Settings page or SMS_API_KEY/KAVENEGAR_OTP_TEMPLATE)
// it just logs the code so the OTP flow is fully testable without a paid account.
@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name);

  constructor(private settings: SettingsService) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    const apiKey = await this.settings.resolve('smsApiKey');
    const template = await this.settings.resolve('kavenegarOtpTemplate');

    if (!apiKey || !template) {
      this.logger.warn(`[DEV SMS] OTP for ${phone}: ${code}`);
      return;
    }

    const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json`;
    const body = new URLSearchParams({ receptor: phone, token: code, template });

    const res = await fetch(url, { method: 'POST', body });
    const data = await res.json().catch(() => null);

    if (!res.ok || data?.return?.status !== 200) {
      const reason = data?.return?.message ?? `HTTP ${res.status}`;
      throw new Error(`Kavenegar verify/lookup failed: ${reason}`);
    }
  }
}
