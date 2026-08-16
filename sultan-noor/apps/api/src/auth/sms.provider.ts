import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

// Thin abstraction over an Iranian SMS gateway. Supports MeliPayamak's
// simple REST send (https://console.melipayamak.com/api/send/simple/{apiKey})
// and Kavenegar's Verify Lookup API (https://kavenegar.com/rest.html#lookup) —
// whichever has credentials configured (via the admin dashboard's Settings
// page, or the matching env vars) is used, MeliPayamak taking priority since
// it needs no pre-approved template. In development (or until either is
// configured) it just logs the code so the OTP flow is fully testable
// without a paid account.
@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name);

  constructor(private settings: SettingsService) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    const melipayamakApiKey = await this.settings.resolve('melipayamakApiKey');
    const melipayamakSender = await this.settings.resolve('melipayamakSender');
    if (melipayamakApiKey && melipayamakSender) {
      return this.sendViaMelipayamak(phone, `کد تایید شما: ${code}`, melipayamakApiKey, melipayamakSender);
    }

    const kavenegarApiKey = await this.settings.resolve('smsApiKey');
    const kavenegarTemplate = await this.settings.resolve('kavenegarOtpTemplate');
    if (kavenegarApiKey && kavenegarTemplate) {
      return this.sendViaKavenegar(phone, code, kavenegarApiKey, kavenegarTemplate);
    }

    this.logger.warn(`[DEV SMS] OTP for ${phone}: ${code}`);
  }

  // Free-text transactional SMS (order status, etc). Kavenegar's configured
  // credentials are OTP-template-only (verify/lookup), so only MeliPayamak
  // can send arbitrary text; without it this degrades to a log line, same
  // as the OTP dev fallback above.
  async sendText(phone: string, text: string): Promise<void> {
    const melipayamakApiKey = await this.settings.resolve('melipayamakApiKey');
    const melipayamakSender = await this.settings.resolve('melipayamakSender');
    if (melipayamakApiKey && melipayamakSender) {
      return this.sendViaMelipayamak(phone, text, melipayamakApiKey, melipayamakSender);
    }

    this.logger.warn(`[DEV SMS] To ${phone}: ${text}`);
  }

  private async sendViaMelipayamak(phone: string, text: string, apiKey: string, sender: string): Promise<void> {
    const res = await fetch(`https://console.melipayamak.com/api/send/simple/${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: sender, to: phone, text }),
    });
    const data = await res.json().catch(() => null);

    // MeliPayamak returns a positive message id string/number on success,
    // a negative error code on failure.
    const recId = Number(data?.recId ?? data);
    if (!res.ok || !Number.isFinite(recId) || recId <= 0) {
      throw new Error(`MeliPayamak send failed: ${JSON.stringify(data)}`);
    }
  }

  private async sendViaKavenegar(phone: string, code: string, apiKey: string, template: string): Promise<void> {
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
